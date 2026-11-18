const test=require('node:test'),assert=require('node:assert/strict');
const {criarBackup,restaurarBackup}=require('../scripts/backupBanco');
test('backup exige chave e restauração recusa falta de confirmação ou mesmo banco sem executar ferramentas',async()=>{
    await assert.rejects(criarBackup({env:{}}),/BACKUP_ENCRYPTION_KEY/);
    await assert.rejects(restaurarBackup({env:{}}),/Confirme/);
    const env={BACKUP_ENCRYPTION_KEY:'a'.repeat(64),CONFIRM_RESTORE:'RESTORE_EMPTY_DATABASE',DATABASE_URL:'postgresql://user@localhost/banco',RESTORE_DATABASE_URL:'postgresql://outro@localhost/%62anco'};
    await assert.rejects(restaurarBackup({env,arquivo:'nao-ler'}),/origem/);
});
