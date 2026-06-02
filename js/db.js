/**
 * Состояние базы данных и константы конфигурации
 */

export const ENTITY_ID = 'b24_pwd_vault_v2'; 
export const AUTH_RECORD_NAME = '---AUTH-CHECK---';
export const TYPES_RECORD_NAME = '---ACCESS-TYPES---';
export const AUTH_CHECK_WORD = 'OK_VAULT_OPEN';

// Единое реактивное состояние (State) приложения
export const state = {
    currentCompanyId: null,
    masterKey: null,
    authRecordId: null,
    typesRecordId: null,
    authRecordEncryptedPayload: null,
    allAppRecords: [],
    accessTypes: ['Почта', 'CRM', 'Хостинг', 'Сервер', 'База данных']
};