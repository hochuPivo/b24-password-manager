import { state, ENTITY_ID, AUTH_RECORD_NAME, TYPES_RECORD_NAME } from './db.js';
import { decryptText, encryptText } from './crypto.js';

export const DOM = {
    screens: document.querySelectorAll('.screen'),
    errors: document.querySelectorAll('.error-msg'),
    tbody: document.getElementById('access_table_body'),
    dropdown: document.getElementById('custom_type_dropdown'),
    inputs: {
        id: document.getElementById('element_id'),
        type: document.getElementById('acc_type'),
        name: document.getElementById('name'),
        login: document.getElementById('login'),
        password: document.getElementById('password'),
        comment: document.getElementById('comment')
    },
    buttons: {
        save: document.getElementById('save_btn')
    }
};

export function switchScreen(screenId) {
    DOM.screens.forEach(el => el.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
    DOM.errors.forEach(el => el.style.display = 'none');
}

export function hideTypeDropdown() {
    DOM.dropdown.classList.remove('active');
}

// Вынесли функции обратного вызова на экспорт, чтобы привязать их в app.js
export let onEditCallback = null;
export let onDeleteCallback = null;
export let onTypesChangeCallback = null;

export function initUiCallbacks(editCb, deleteCb, typesChangeCb) {
    onEditCallback = editCb;
    onDeleteCallback = deleteCb;
    onTypesChangeCallback = typesChangeCb;
}

export function renderTypesSelect() {
    DOM.dropdown.innerHTML = '';
    const rawVal = DOM.inputs.type.value.trim();
    const currentVal = rawVal.toLowerCase();
    
    const filtered = state.accessTypes.filter(t => t.toLowerCase().includes(currentVal));

    filtered.forEach(t => {
        let div = document.createElement('div');
        div.className = 'dropdown-item';
        div.textContent = t;
        div.onclick = function() {
            DOM.inputs.type.value = t;
            hideTypeDropdown();
        };
        DOM.dropdown.appendChild(div);
    });

    const exactMatch = state.accessTypes.some(t => t.toLowerCase() === currentVal);
    if (rawVal !== '' && !exactMatch) {
        let addDiv = document.createElement('div');
        addDiv.className = 'dropdown-item dropdown-add-item';
        addDiv.innerHTML = `➕ Добавить «<b>${rawVal}</b>» в шаблоны`;
        addDiv.onclick = function() {
            DOM.inputs.type.value = rawVal;
            state.accessTypes.push(rawVal);
            if (onTypesChangeCallback) onTypesChangeCallback();
            hideTypeDropdown();
        };
        DOM.dropdown.appendChild(addDiv);
    }

    if (DOM.dropdown.children.length === 0) {
        hideTypeDropdown();
    } else {
        DOM.dropdown.classList.add('active');
    }
}

export function renderTypesSettings() {
    const container = document.getElementById('modal_types_list');
    container.innerHTML = '';
    
    if(state.accessTypes.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:15px; color:var(--b24-text-light);">Список пуст.</div>';
        return;
    }

    state.accessTypes.forEach((t, index) => {
        const row = document.createElement('div');
        row.className = 'modal-list-row';

        const textSpan = document.createElement('span');
        textSpan.textContent = t;
        textSpan.style.flex = "1";

        const btnGroup = document.createElement('div');
        btnGroup.style.display = "flex";
        btnGroup.style.gap = "4px";

        const btnEdit = document.createElement('button');
        btnEdit.className = 'btn btn-edit';
        btnEdit.style.height = '28px'; btnEdit.style.padding = '0 10px'; btnEdit.style.fontSize = '12px';
        btnEdit.textContent = '✏️';
        btnEdit.title = 'Изменить';
        btnEdit.onclick = () => {
            const newVal = prompt('Изменить шаблон типа:', t);
            if (newVal !== null) {
                const trimmed = newVal.trim();
                if (trimmed && trimmed !== t) {
                    if (state.accessTypes.includes(trimmed)) { alert('Такой шаблон уже есть!'); return; }
                    state.accessTypes[index] = trimmed;
                    if (onTypesChangeCallback) onTypesChangeCallback();
                }
            }
        };

        const btnDel = document.createElement('button');
        btnDel.className = 'btn btn-danger';
        btnDel.style.height = '28px'; btnDel.style.padding = '0 10px'; btnDel.style.fontSize = '12px';
        btnDel.textContent = '🗑️';
        btnDel.title = 'Удалить';
        btnDel.onclick = () => {
            if(confirm('Удалить этот шаблон?')) {
                state.accessTypes.splice(index, 1);
                if (onTypesChangeCallback) onTypesChangeCallback();
            }
        };

        btnGroup.append(btnEdit, btnDel);
        row.append(textSpan, btnGroup);
        container.appendChild(row);
    });
}

function createSafeCell(text, isCode = false) {
    const td = document.createElement('td');
    td.textContent = text || ''; 
    if(isCode) { td.style.fontFamily = "monospace"; td.style.letterSpacing = "0.5px"; }
    return td;
}

export function renderTable() {
    DOM.tbody.innerHTML = '';
    const dataRecords = state.allAppRecords.filter(item => item.NAME !== AUTH_RECORD_NAME && item.NAME !== TYPES_RECORD_NAME);

    if (dataRecords.length === 0) {
        DOM.tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--b24-text-light); padding: 30px 10px;">Нет сохраненных доступов. Нажмите "Добавить".</td></tr>';
        return;
    }

    const fragment = document.createDocumentFragment();

    dataRecords.forEach(item => {
        let decryptedPayload = decryptText(item.DETAIL_TEXT, state.masterKey);
        let data = { type: '', login: '', password: '', comment: '' };
        
        if (decryptedPayload) { try { data = JSON.parse(decryptedPayload); } catch (e) {} } 
        else { data.password = "⚠️ Ошибка расшифровки"; }

        let tr = document.createElement('tr');
        tr.appendChild(createSafeCell(data.type));
        tr.appendChild(createSafeCell(item.NAME)); 
        tr.appendChild(createSafeCell(data.login));
        tr.appendChild(createSafeCell(data.password, true));
        tr.appendChild(createSafeCell(data.comment));

        let tdActions = document.createElement('td');
        tdActions.className = 'actions-cell';

        let btnsWrapper = document.createElement('div');
        btnsWrapper.style.display = 'flex'; btnsWrapper.style.gap = '4px';

        let btnCopy = document.createElement('button');
        btnCopy.className = 'btn btn-outline'; 
        btnCopy.style.height = '30px'; btnCopy.style.padding = '0 10px'; btnCopy.title = 'Копировать';
        btnCopy.innerHTML = '📋';
        btnCopy.onclick = () => {
            let parts = [];
            if (data.type) parts.push(`Тип: ${data.type}`);
            if (item.NAME && item.NAME !== '—') parts.push(`Адрес: ${item.NAME}`);
            if (data.login) parts.push(`Логин: ${data.login}`);
            if (data.password && data.password !== "⚠️ Ошибка расшифровки") parts.push(`Пароль: ${data.password}`);
            if (data.comment) parts.push(`Комментарий: ${data.comment}`);

            const copyText = parts.join('\n');
            let textArea = document.createElement("textarea");
            textArea.value = copyText; textArea.style.position = "fixed"; textArea.style.left = "-9999px";
            document.body.appendChild(textArea); textArea.focus(); textArea.select();
            try { 
                document.execCommand('copy'); 
                btnCopy.innerHTML = '✅'; setTimeout(() => btnCopy.innerHTML = '📋', 1500);
            } catch (err) { alert('Ошибка буфера.'); }
            document.body.removeChild(textArea);
        };

        let btnEdit = document.createElement('button');
        btnEdit.className = 'btn btn-edit'; 
        btnEdit.style.height = '30px'; btnEdit.style.padding = '0 10px'; btnEdit.title = 'Изменить';
        btnEdit.innerHTML = '✏️';
        btnEdit.onclick = () => { if (onEditCallback) onEditCallback(item, data); };

        let btnDel = document.createElement('button');
        btnDel.className = 'btn btn-danger'; 
        btnDel.style.height = '30px'; btnDel.style.padding = '0 10px'; btnDel.title = 'Удалить';
        btnDel.innerHTML = '🗑️';
        btnDel.onclick = () => { if (onDeleteCallback) onDeleteCallback(item.ID); };

        btnsWrapper.append(btnCopy, btnEdit, btnDel);
        tdActions.appendChild(btnsWrapper);
        tr.appendChild(tdActions);
        fragment.appendChild(tr);
    });

    DOM.tbody.appendChild(fragment);
}