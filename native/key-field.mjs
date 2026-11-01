/** A non-login API token field, visually masked. It does not change credential storage.
 * Chrome password-manager UI is browser-owned; no web control can promise never to show it.
 * CSS masking is visual privacy only, not encryption or protection from scripts.
 */
export function createKeyField(doc=document){
 const input=doc.createElement('input');
 input.id='nc-key';input.type='text';input.className='text_pole nc-api-token';
 input.autocomplete='off';input.spellcheck=false;
 input.setAttribute('autocorrect','off');input.setAttribute('autocapitalize','none');
 input.setAttribute('inputmode','text');input.setAttribute('aria-label','API Key');
 input.setAttribute('data-lpignore','true');input.setAttribute('data-1p-ignore','true');
 // Do not give this non-login field a username/password name or new-password token.
 const cssMask=Boolean(doc.defaultView?.CSS?.supports?.('-webkit-text-security','disc'));
 let revealed=false;
 const toggle=doc.createElement('button');toggle.type='button';toggle.id='nc-show-key';toggle.className='menu_button';
 function paint(){
  if(cssMask){input.type='text';input.style.setProperty('-webkit-text-security',revealed?'none':'disc');}
  else{input.type=revealed?'text':'password';}
  toggle.textContent=revealed?'隐藏':'显示';
  toggle.setAttribute('aria-pressed',String(revealed));
  toggle.setAttribute('aria-label',revealed?'隐藏 API Key':'显示 API Key');
 }
 toggle.addEventListener('click',()=>{revealed=!revealed;paint();});
 paint();
 return{input,toggle,cssMask,clear(){input.value='';revealed=false;paint();},conceal(){revealed=false;paint();}};
}
