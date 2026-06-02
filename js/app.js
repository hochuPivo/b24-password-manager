import { state, ENTITY_ID, AUTH_RECORD_NAME, TYPES_RECORD_NAME, AUTH_CHECK_WORD } from './db.js';
import { encryptText, decryptText, generateAndFillPassword } from './crypto.js';
import { DOM, switchScreen, renderTable, renderTypesSelect, renderTypesSettings, hideTypeDropdown, initUiCallbacks } from './ui.js';

// --- ИНИЦИАЛИЗАЦИЯ BX24 ---
BX24.init(function () {
    let placementInfo = BX24.placement.info();
    if (placementInfo && placementInfo.options && placementInfo.options.ID) {
        state.currentCompanyId = parseInt(placementInfo.options.ID);
        initEntityStorage();
    } else {
        document.body.innerHTML = '<h3 style="color:var(--b24-danger); text-align:center; margin-top:50px;">Ошибка: Откройте приложение внутри карточки Компании.</h3>';
    }
});

function initEntityStorage() {
    BX24.callMethod('entity.add', { 'ENTITY': ENTITY_ID, 'NAME': 'Хранилище E2E', 'ACCESS': { 'AU': 'W' } }, function () {
        checkVaultStatus();
    });
}

function checkVaultStatus() {
    BX24.callMethod('entity.item.get', { 'ENTITY': ENTITY_ID, 'FILTER': { 'SORT': state.currentCompanyId } }, function (res) {
        if (res.error()) return;
        state.allAppRecords = res.data();

        const authRecord = state.allAppRecords.find(i => i.NAME === AUTH_RECORD_NAME);
        const typesRecord = state.allAppRecords.find(i => i.NAME === TYPES_RECORD_NAME);

        if (typesRecord) {
            state.typesRecordId = typesRecord.ID;
            let decryptedTypes = decryptText(typesRecord.DETAIL_TEXT, state.masterKey);
            if (decryptedTypes) { try { state.accessTypes = JSON.parse(decryptedTypes); } catch (e) { } }
        }

        if (authRecord) {
            state.authRecordId = authRecord.ID;
            state.authRecordEncryptedPayload = authRecord.DETAIL_TEXT;
            if (state.masterKey) {
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
    BX24.callMethod('entity.item.get', { 'ENTITY': ENTITY_ID, 'FILTER': { 'SORT': state.currentCompanyId } }, function (res) {
        if (!res.error()) {
            state.allAppRecords = res.data();
            renderTable();
        }
    });
}

// --- СЛУШАТЕЛИ СОБЫТИЙ (EVENT LISTENERS) ---
document.addEventListener('DOMContentLoaded', () => {
    // Привязываем коллбэки для UI слоя
    initUiCallbacks(openEditForm, deleteAccess, saveTypesToStorage);

    // Логин / Настройка
    document.getElementById('btn_submit_setup').onclick = setupMasterPassword;
    document.getElementById('btn_submit_login').onclick = unlockVault;
    document.getElementById('btn_gen_setup').onclick = () => generateAndFillPassword('setup_password');

    // Смена мастер-пароля
    document.getElementById('btn_execute_change').onclick = executePasswordChange;
    document.getElementById('btn_gen_change').onclick = () => generateAndFillPassword('change_new_pwd');
    document.getElementById('btn_cancel_change').onclick = () => switchScreen('screen_app');

    // Кнопки шапки
    document.getElementById('btn_open_add').onclick = openAddModal;
    document.getElementById('btn_open_types').onclick = openTypesModal;
    document.getElementById('btn_open_crypto').onclick = () => switchScreen('screen_change_master');

    // Управление добавлением элементов
    document.getElementById('save_btn').onclick = saveAccess;
    document.getElementById('btn_cancel_add').onclick = closeAddModal;
    document.getElementById('modal_add_close').onclick = closeAddModal;
    document.getElementById('btn_gen_pwd').onclick = () => generateAndFillPassword('password');

    // Модалка типов
    document.getElementById('modal_types_close').onclick = closeTypesModal;
    document.getElementById('btn_add_new_type').onclick = addNewAccessType;
    document.getElementById('acc_type').oninput = () => renderTypesSelect();
});

// --- ОПЕРАЦИИ С БАЗОЙ И ЛОГИКА ---

function setupMasterPassword() {
    const pwd = document.getElementById('setup_password').value.trim();
    if (!pwd) { document.getElementById('setup_error').style.display = 'block'; return; }
    state.masterKey = pwd;
    BX24.callMethod('entity.item.add', {
        'ENTITY': ENTITY_ID, 'NAME': AUTH_RECORD_NAME, 'DETAIL_TEXT': encryptText(AUTH_CHECK_WORD, pwd), 'SORT': state.currentCompanyId
    }, function (res) {
        if (!res.error()) {
            state.authRecordId = res.data();
            saveTypesToStorage();
            checkVaultStatus();
        }
    });
}

function unlockVault() {
    const pwd = document.getElementById('login_password').value;
    if (decryptText(state.authRecordEncryptedPayload, pwd) === AUTH_CHECK_WORD) {
        state.masterKey = pwd;
        document.getElementById('login_password').value = '';
        switchScreen('screen_app');
        refreshData();
    } else {
        document.getElementById('login_error').style.display = 'block';
    }
}

function saveAccess() {
    const vals = {
        id: DOM.inputs.id.value.trim(),
        type: DOM.inputs.type.value.trim(),
        name: DOM.inputs.name.value.trim(),
        login: DOM.inputs.login.value.trim(),
        password: DOM.inputs.password.value.trim(),
        comment: DOM.inputs.comment.value.trim()
    };

    const errorMsg = document.getElementById('form_error');
    if (!vals.login || !vals.password) { errorMsg.style.display = 'block'; return; }
    errorMsg.style.display = 'none';

    const finalName = vals.name || '—';
    const encryptedPayload = encryptText(JSON.stringify({
        type: vals.type, login: vals.login, password: vals.password, comment: vals.comment
    }), state.masterKey);

    const params = {
        'ENTITY': ENTITY_ID, 'NAME': finalName, 'DETAIL_TEXT': encryptedPayload, 'SORT': state.currentCompanyId
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
    if (!res.error()) { closeAddModal(); refreshData(); }
    else { alert('Ошибка: ' + res.error()); }
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

function openEditForm(item, data) {
    DOM.inputs.id.value = item.ID;
    DOM.inputs.type.value = data.type;
    DOM.inputs.name.value = item.NAME === '—' ? '' : item.NAME;
    DOM.inputs.login.value = data.login;
    DOM.inputs.password.value = data.password === "⚠️ Ошибка расшифровки" ? "" : data.password;
    DOM.inputs.comment.value = data.comment;

    document.getElementById('add_modal_title').innerText = 'Редактировать доступ';
    openAddModal();
}

function deleteAccess(id) {
    if (confirm('Вы уверены, что хотите удалить этот доступ?')) {
        BX24.callMethod('entity.item.delete', { 'ENTITY': ENTITY_ID, 'ID': id }, (res) => { if (!res.error()) refreshData(); });
    }
}

function addNewAccessType() {
    const input = document.getElementById('new_type_input');
    const val = input.value.trim();
    if (!val) return;
    if (state.accessTypes.includes(val)) { alert('Такой шаблон уже существует.'); return; }
    state.accessTypes.push(val);
    input.value = '';
    saveTypesToStorage();
}

function saveTypesToStorage() {
    const payload = encryptText(JSON.stringify(state.accessTypes), state.masterKey);
    const params = {
        'ENTITY': ENTITY_ID, 'NAME': TYPES_RECORD_NAME, 'DETAIL_TEXT': payload, 'SORT': state.currentCompanyId
    };
    if (state.typesRecordId) params.ID = state.typesRecordId;

    BX24.callMethod(state.typesRecordId ? 'entity.item.update' : 'entity.item.add', params, function (res) {
        if (!res.error()) {
            if (!state.typesRecordId && res.data()) state.typesRecordId = res.data();
            renderTypesSettings();
        }
    });
}

function executePasswordChange() {
    const oldPwd = document.getElementById('change_old_pwd').value;
    const newPwd = document.getElementById('change_new_pwd').value.trim();
    const error = document.getElementById('change_error');

    if (oldPwd !== state.masterKey) { error.innerText = 'Текущий пароль неверный!'; error.style.display = 'block'; return; }
    if (!newPwd || oldPwd === newPwd) { error.innerText = 'Введите новый пароль'; error.style.display = 'block'; return; }
    error.style.display = 'none';

    let batchData = {};
    state.allAppRecords.forEach((item, idx) => {
        let fields = { 'NAME': item.NAME, 'SORT': state.currentCompanyId };

        if (item.NAME === AUTH_RECORD_NAME) {
            fields['DETAIL_TEXT'] = encryptText(AUTH_CHECK_WORD, newPwd);
        } else if (item.NAME === TYPES_RECORD_NAME) {
            let decTypes = decryptText(item.DETAIL_TEXT, oldPwd);
            if (decTypes) fields['DETAIL_TEXT'] = encryptText(decTypes, newPwd);
        } else {
            let decPayload = decryptText(item.DETAIL_TEXT, oldPwd);
            if (decPayload) fields['DETAIL_TEXT'] = encryptText(decPayload, newPwd);
        }

        if (fields['DETAIL_TEXT']) {
            batchData['cmd_' + idx] = ['entity.item.update', { 'ENTITY': ENTITY_ID, 'ID': item.ID, ...fields }];
        }
    });

    document.querySelector('#screen_change_master .btn-danger').innerText = 'Перешифровка...';
    BX24.callBatch(batchData, () => {
        document.querySelector('#screen_change_master .btn-danger').innerText = 'Сменить пароль';
        document.getElementById('change_old_pwd').value = ''; document.getElementById('change_new_pwd').value = '';
        state.masterKey = newPwd; switchScreen('screen_app'); refreshData();
    });
}