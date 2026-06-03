// --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И НАСТРОЙКИ ---
const ENTITY_ID = 'b24_pwd_vault_v3'; 
const AUTH_RECORD_NAME = '---AUTH-CHECK---';
const TYPES_RECORD_NAME = '---ACCESS-TYPES---';
const PWD_RECORD_NAME = '---PWD-RECORD---';
const AUTH_CHECK_WORD = 'OK_VAULT_OPEN';

const DOM = {
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

let currentEntityId = null;
let currentEntityType = null;
let masterKey = null; 
let authRecordId = null; 
let typesRecordId = null;
let authRecordEncryptedPayload = null;
let allAppRecords = []; 
let accessTypes = ['Почта', 'CRM', 'Хостинг', 'Сервер', 'База данных'];

// --- ИНИЦИАЛИЗАЦИЯ И ПРИВЯЗКА К СУЩНОСТИ CRM ---
BX24.init(function() {
    let info = BX24.placement.info();
    
    if (info && info.options && info.options.ID) {
        currentEntityId = parseInt(info.options.ID);
        let p = info.placement;
        if (p.includes('COMPANY')) currentEntityType = 'COMPANY';
        else if (p.includes('LEAD')) currentEntityType = 'LEAD';
        else if (p.includes('DEAL')) currentEntityType = 'DEAL';
        else currentEntityType = p;
    }
    
    initEntityStorage();
});

document.addEventListener('click', function(e) {
    if (e.target !== DOM.inputs.type && e.target !== DOM.dropdown) {
        hideTypeDropdown();
    }
});

// --- КРИПТОГРАФИЯ ---
const encryptText = (text, key) => CryptoJS.AES.encrypt(text, key).toString();
const decryptText = (cipher, key) => {
    try { return CryptoJS.AES.decrypt(cipher, key).toString(CryptoJS.enc.Utf8) || null; } 
    catch (e) { return null; }
};
const generatePassword = (len = 16) => {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~";
    return Array.from({length: len}, () => charset[Math.floor(Math.random() * charset.length)]).join('');
};
const generateAndFillPassword = (id) => document.getElementById(id).value = generatePassword();

// --- УПРАВЛЕНИЕ ОКНАМИ ---
function switchScreen(screenId) {
    DOM.screens.forEach(el => el.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
    DOM.errors.forEach(el => el.style.display = 'none');
}

function openAddModal() {
    document.getElementById('add_modal').classList.add('active');
    renderTypesSelect(); 
}

function closeAddModal() {
    document.getElementById('add_modal').classList.remove('active');
    Object.values(DOM.inputs).forEach(input => input.value = '');
    document.getElementById('form_error').style.display = 'none';
    document.getElementById('add_modal_title').innerText = 'Добавить доступ';
    hideTypeDropdown();
}

function openTypesModal() {
    document.getElementById('type_modal').classList.add('active');
    renderTypesSettings();
}

function closeTypesModal() {
    document.getElementById('type_modal').classList.remove('active');
    document.getElementById('new_type_input').value = '';
}

// --- ВЫПАДАЮЩИЙ СПИСОК ПОДСКАЗОК ---
function renderTypesSelect() {
    DOM.dropdown.innerHTML = '';
    const rawVal = DOM.inputs.type.value.trim();
    const currentVal = rawVal.toLowerCase();
    
    const filtered = accessTypes.filter(t => t.toLowerCase().includes(currentVal));

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

    const exactMatch = accessTypes.some(t => t.toLowerCase() === currentVal);
    if (rawVal !== '' && !exactMatch) {
        let addDiv = document.createElement('div');
        addDiv.className = 'dropdown-item dropdown-add-item';
        addDiv.innerHTML = `➕ Добавить «<b>${rawVal}</b>» в шаблоны`;
        addDiv.onclick = function() {
            DOM.inputs.type.value = rawVal;
            accessTypes.push(rawVal);
            saveTypesToStorage();
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

function showTypeDropdown() { renderTypesSelect(); }
function hideTypeDropdown() { DOM.dropdown.classList.remove('active'); }
function filterTypeDropdown() { renderTypesSelect(); }

// --- УПРАВЛЕНИЕ ШАБЛОНАМИ ТИПОВ ---
function renderTypesSettings() {
    const container = document.getElementById('modal_types_list');
    container.innerHTML = '';
    
    if(accessTypes.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:15px; color:var(--b24-text-light);">Список пуст.</div>';
        return;
    }

    accessTypes.forEach((t, index) => {
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
        btnEdit.style.cssText = 'height:28px; padding:0 10px; font-size:12px;';
        btnEdit.textContent = '✏️';
        btnEdit.title = 'Изменить';
        btnEdit.onclick = () => {
            const newVal = prompt('Изменить шаблон типа:', t);
            if (newVal !== null) {
                const trimmed = newVal.trim();
                if (trimmed && trimmed !== t) {
                    if (accessTypes.includes(trimmed)) { alert('Такой шаблон уже есть!'); return; }
                    accessTypes[index] = trimmed;
                    saveTypesToStorage();
                }
            }
        };

        const btnDel = document.createElement('button');
        btnDel.className = 'btn btn-danger';
        btnDel.style.cssText = 'height:28px; padding:0 10px; font-size:12px;';
        btnDel.textContent = '🗑️';
        btnDel.title = 'Удалить';
        btnDel.onclick = () => {
            if(confirm('Удалить этот шаблон?')) {
                accessTypes.splice(index, 1);
                saveTypesToStorage();
            }
        };

        btnGroup.append(btnEdit, btnDel);
        row.append(textSpan, btnGroup);
        container.appendChild(row);
    });
}

function addNewAccessType() {
    const input = document.getElementById('new_type_input');
    const val = input.value.trim();
    if(!val) return;
    if(accessTypes.includes(val)) { alert('Такой шаблон уже существует.'); return; }
    accessTypes.push(val);
    input.value = '';
    saveTypesToStorage();
}

function saveTypesToStorage() {
    const payload = encryptText(JSON.stringify(accessTypes), masterKey);
    const params = { 'ENTITY': ENTITY_ID, 'NAME': TYPES_RECORD_NAME, 'DETAIL_TEXT': payload };
    if(typesRecordId) params.ID = typesRecordId;

    BX24.callMethod(typesRecordId ? 'entity.item.update' : 'entity.item.add', params, function(res) {
        if(!res.error()) {
            if(!typesRecordId && res.data()) typesRecordId = res.data();
            renderTypesSettings();
        }
    });
}

// --- БИТРИКС24 СВЯЗЬ ХРАНИЛИЩА ---
function initEntityStorage() {
    BX24.callMethod('entity.add', { 'ENTITY': ENTITY_ID, 'NAME': 'Хранилище E2E Global', 'ACCESS': { 'AU': 'W' } }, function() {
        checkVaultStatus();
    });
}

function checkVaultStatus() {
    BX24.callMethod('entity.item.get', { 'ENTITY': ENTITY_ID }, function(res) {
        if(res.error()) return;
        allAppRecords = res.data();
        
        const authRecord = allAppRecords.find(i => i.NAME === AUTH_RECORD_NAME);
        const typesRecord = allAppRecords.find(i => i.NAME === TYPES_RECORD_NAME);

        if (authRecord) {
            authRecordId = authRecord.ID;
            authRecordEncryptedPayload = authRecord.DETAIL_TEXT;
            
            if (masterKey) { 
                if (typesRecord) {
                    typesRecordId = typesRecord.ID;
                    let decryptedTypes = decryptText(typesRecord.DETAIL_TEXT, masterKey);
                    if(decryptedTypes) { try { accessTypes = JSON.parse(decryptedTypes); } catch(e){} }
                }
                switchScreen('screen_app'); 
                renderTable(); 
            } else { 
                switchScreen('screen_login'); 
            }
        } else {
            switchScreen('screen_setup');
        }
    });
}

function refreshData() {
    BX24.callMethod('entity.item.get', { 'ENTITY': ENTITY_ID }, function(res) {
        if(!res.error()) { 
            allAppRecords = res.data(); 
            
            const typesRecord = allAppRecords.find(i => i.NAME === TYPES_RECORD_NAME);
            if (typesRecord) {
                typesRecordId = typesRecord.ID;
                let decryptedTypes = decryptText(typesRecord.DETAIL_TEXT, masterKey);
                if(decryptedTypes) { try { accessTypes = JSON.parse(decryptedTypes); } catch(e){} }
            }

            renderTable(); 
        }
    });
}

function setupMasterPassword() {
    const pwd = document.getElementById('setup_password').value.trim();
    if (!pwd) { document.getElementById('setup_error').style.display = 'block'; return; }

    masterKey = pwd; 
    BX24.callMethod('entity.item.add', {
        'ENTITY': ENTITY_ID, 'NAME': AUTH_RECORD_NAME, 'DETAIL_TEXT': encryptText(AUTH_CHECK_WORD, pwd)
    }, function(res) { 
        if(!res.error()) {
            authRecordId = res.data();
            saveTypesToStorage();
            checkVaultStatus();
        } 
    });
}

function unlockVault() {
    const pwd = document.getElementById('login_password').value;
    if (decryptText(authRecordEncryptedPayload, pwd) === AUTH_CHECK_WORD) {
        masterKey = pwd;
        document.getElementById('login_password').value = ''; 
                switchScreen('screen_app');
        refreshData();
    } else {
        document.getElementById('login_error').style.display = 'block';
    }
}

function createSafeCell(text, isCode = false) {
    const td = document.createElement('td');
    td.textContent = text || ''; 
    if(isCode) { td.style.fontFamily = "monospace"; td.style.letterSpacing = "0.5px"; }
    return td;
}

function renderTable() {
    DOM.tbody.innerHTML = '';
    const dataRecords = allAppRecords.filter(item => item.NAME === PWD_RECORD_NAME);

    if (dataRecords.length === 0) {
        DOM.tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--b24-text-light); padding: 30px 10px;">Нет сохраненных доступов. Нажмите "Добавить".</td></tr>';
        return;
    }

    const fragment = document.createDocumentFragment();

    dataRecords.forEach(item => {
        let pub = { type: '', comment: '', entityId: '', entityType: '', secure: '' };
        let sec = { address: '', login: '', password: '⚠️ Ошибка расшифровки' };
        
        try {
            pub = JSON.parse(item.DETAIL_TEXT);
            if (pub.secure) {
                let dec = decryptText(pub.secure, masterKey);
                if (dec) { sec = JSON.parse(dec); }
            }
        } catch (e) {
            console.error("Parse Error");
        }

        let affHtml = '<span style="color:var(--b24-text-light)">Общее</span>';
        if (pub.entityId && pub.entityType) {
            if (pub.entityType === 'COMPANY') {
                affHtml = `<a class="affiliation-link" href="/crm/company/details/${pub.entityId}/" target="_blank">Компания #${pub.entityId}</a>`;
            } else if (pub.entityType === 'LEAD') {
                affHtml = `<a class="affiliation-link" href="/crm/lead/details/${pub.entityId}/" target="_blank">Лид #${pub.entityId}</a>`;
            } else if (pub.entityType === 'DEAL') {
                affHtml = `<a class="affiliation-link" href="/crm/deal/details/${pub.entityId}/" target="_blank">Сделка #${pub.entityId}</a>`;
            } else {
                affHtml = `<span style="font-size:12px; color:var(--b24-text-light)">${pub.entityType} #${pub.entityId}</span>`;
            }
        }

        let tr = document.createElement('tr');
        tr.appendChild(createSafeCell(pub.type));
        tr.appendChild(createSafeCell(sec.address)); 
        tr.appendChild(createSafeCell(sec.login));
        tr.appendChild(createSafeCell(sec.password, true));
        tr.appendChild(createSafeCell(pub.comment));
        
        let tdAff = document.createElement('td');
        tdAff.innerHTML = affHtml;
        tr.appendChild(tdAff);

        let tdActions = document.createElement('td');
        tdActions.className = 'actions-cell';

        let btnsWrapper = document.createElement('div');
        btnsWrapper.style.display = 'flex'; btnsWrapper.style.gap = '4px';

        let btnCopy = document.createElement('button');
        btnCopy.className = 'btn btn-outline'; 
        btnCopy.style.cssText = 'height:30px; padding:0 10px;'; btnCopy.title = 'Копировать';
        btnCopy.innerHTML = '📋';
        btnCopy.onclick = () => {
            let parts = [];
            if (pub.type) parts.push(`Тип: ${pub.type}`);
            if (sec.address) parts.push(`Адрес: ${sec.address}`);
            if (sec.login) parts.push(`Логин: ${sec.login}`);
            if (sec.password && sec.password !== "⚠️ Ошибка расшифровки") parts.push(`Пароль: ${sec.password}`);
            if (pub.comment) parts.push(`Комментарий: ${pub.comment}`);

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
        btnEdit.style.cssText = 'height:30px; padding:0 10px;'; btnEdit.title = 'Изменить';
        btnEdit.innerHTML = '✏️';
        btnEdit.onclick = () => editAccess(item.ID, pub.type, sec.address, sec.login, sec.password, pub.comment);

        let btnDel = document.createElement('button');
        btnDel.className = 'btn btn-danger'; 
        btnDel.style.cssText = 'height:30px; padding:0 10px;'; btnDel.title = 'Удалить';
        btnDel.innerHTML = '🗑️';
        btnDel.onclick = () => deleteAccess(item.ID);

        btnsWrapper.append(btnCopy, btnEdit, btnDel);
        tdActions.appendChild(btnsWrapper);
        tr.appendChild(tdActions);
        fragment.appendChild(tr);
    });

    DOM.tbody.appendChild(fragment);
}

function saveAccess() {
    const vals = {
        id: DOM.inputs.id.value.trim(),
        type: DOM.inputs.type.value.trim(),
        address: DOM.inputs.name.value.trim(), 
        login: DOM.inputs.login.value.trim(),
        password: DOM.inputs.password.value.trim(),
        comment: DOM.inputs.comment.value.trim()
    };

    const errorMsg = document.getElementById('form_error');
    if (!vals.login || !vals.password) { errorMsg.style.display = 'block'; return; }
    errorMsg.style.display = 'none';

    const secureData = JSON.stringify({
        address: vals.address,
        login: vals.login,
        password: vals.password
    });
    const encryptedSecure = encryptText(secureData, masterKey);

    const publicData = {
        type: vals.type,
        comment: vals.comment,
        entityId: currentEntityId || '',
        entityType: currentEntityType || '',
        secure: encryptedSecure
    };

    const params = {
        'ENTITY': ENTITY_ID, 
        'NAME': PWD_RECORD_NAME, 
        'DETAIL_TEXT': JSON.stringify(publicData)
    };

    DOM.buttons.save.innerText = 'Сохранение...'; DOM.buttons.save.disabled = true;

    if (vals.id) {
        params.ID = vals.id;
        BX24.callMethod('entity.item.update', params, (res) => resetSaveButton(res));
    } else {
        BX24.callMethod('entity.item.add', params, (res) => resetSaveButton(res));
    }
}

function resetSaveButton(res) {
    DOM.buttons.save.innerText = 'Сохранить'; DOM.buttons.save.disabled = false;
    if(!res.error()) { closeAddModal(); refreshData(); } 
    else { alert('Ошибка: ' + res.error()); }
}

function editAccess(id, type, address, login, password, comment) {
    DOM.inputs.id.value = id;
    DOM.inputs.type.value = type;
    DOM.inputs.name.value = address; 
    DOM.inputs.login.value = login;
    DOM.inputs.password.value = password === "⚠️ Ошибка расшифровки" ? "" : password;
    DOM.inputs.comment.value = comment;
    
    document.getElementById('add_modal_title').innerText = 'Редактировать доступ';
    openAddModal();
}

function deleteAccess(id) {
    if (confirm('Вы уверены, что хотите удалить этот доступ?')) {
        BX24.callMethod('entity.item.delete', { 'ENTITY': ENTITY_ID, 'ID': id }, (res) => { if(!res.error()) refreshData(); });
    }
}

function executePasswordChange() {
    const oldPwd = document.getElementById('change_old_pwd').value;
    const newPwd = document.getElementById('change_new_pwd').value.trim();
    const error = document.getElementById('change_error');

    if (oldPwd !== masterKey) { error.innerText = 'Текущий пароль неверный!'; error.style.display = 'block'; return; }
    if (!newPwd || oldPwd === newPwd) { error.innerText = 'Введите новый пароль'; error.style.display = 'block'; return; }
    error.style.display = 'none';

    let batchData = {};
    allAppRecords.forEach((item, idx) => {
        let fields = { 'NAME': item.NAME };
        
        if (item.NAME === AUTH_RECORD_NAME) {
            fields['DETAIL_TEXT'] = encryptText(AUTH_CHECK_WORD, newPwd);
        } else if (item.NAME === TYPES_RECORD_NAME) {
            let decTypes = decryptText(item.DETAIL_TEXT, oldPwd);
            if (decTypes) fields['DETAIL_TEXT'] = encryptText(decTypes, newPwd);
        } else if (item.NAME === PWD_RECORD_NAME) {
            let pub = {};
            try { pub = JSON.parse(item.DETAIL_TEXT); } catch(e) {}
            if (pub.secure) {
                let dec = decryptText(pub.secure, oldPwd);
                if (dec) {
                    pub.secure = encryptText(dec, newPwd);
                    fields['DETAIL_TEXT'] = JSON.stringify(pub);
                }
            }
        }
        
        if(fields['DETAIL_TEXT']) {
            batchData['cmd_' + idx] = ['entity.item.update', { 'ENTITY': ENTITY_ID, 'ID': item.ID, ...fields }];
        }
    });

    document.querySelector('#screen_change_master .btn-danger').innerText = 'Перешифровка...';
    BX24.callBatch(batchData, () => {
        document.querySelector('#screen_change_master .btn-danger').innerText = 'Сменить пароль';
        document.getElementById('change_old_pwd').value = ''; document.getElementById('change_new_pwd').value = '';
        masterKey = newPwd; switchScreen('screen_app'); refreshData(); 
    });
}
