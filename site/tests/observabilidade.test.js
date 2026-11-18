const test=require('node:test'), assert=require('node:assert/strict');
const {registrarErro}=require('../config/observabilidade');
test('log operacional conserva código e descarta mensagens, tokens e dados pessoais',()=>{
    const logs=[];registrarErro('consulta',{code:'42P01',message:'senha=SEGREDO email@teste.com',detail:'TOKEN'},s=>logs.push(s));
    const dado=JSON.parse(logs[0]); assert.equal(dado.codigo,'42P01');
    for(const segredo of ['SEGREDO','email@teste.com','TOKEN'])assert.ok(!logs[0].includes(segredo));
});
