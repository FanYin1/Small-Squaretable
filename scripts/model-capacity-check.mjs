import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.MODEL_CHECK_BASE || 'http://127.0.0.1:5197';
const output = process.env.MODEL_CHECK_OUTPUT || 'backups/exploration/model-capacity-20261101/local';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chromium', args: ['--no-proxy-server'] });
const report = { base, mode: 'isolated API fixtures; no production writes or model generation', results: [], errors: [] };
try {
 for (const width of [1440,390]) {
  const context = await browser.newContext({ viewport: { width, height: 1000 } });
  await context.addInitScript(() => {
   localStorage.setItem('token', 'fixture.'+btoa(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600}))+'.fixture');
   localStorage.setItem('tenantId', 'fixture-tenant');localStorage.setItem('locale','zh-CN');
  });
  const meta = { id:'fixture-model', provider:'custom', contextWindow:500000, maxOutputTokens:10000, outputCapabilityTokens:100000, defaultTemperature:0.7 };
  const provider = {id:'custom',name:'容量测试渠道',provider:'custom',apiFormat:'anthropic',baseUrl:'https://example.invalid/v1',hasApiKey:true,models:[meta],defaultModel:meta.id,modelCount:1,modelAliases:{},requestOptions:{}};
  let saved, writes=0;
  await context.route('**/api/**', async route => {
   const path = new URL(route.request().url()).pathname;
   if(path.endsWith('/csrf-token')) return route.fulfill({json:{csrfToken:'a'.repeat(64)}});
   let data={};
   if(path.endsWith('/auth/me')) data={user:{id:'fixture-admin',tenantId:'fixture-tenant',displayName:'隔离管理员',email:'fixture@example.invalid',role:'admin'}};
   else if(path.endsWith('/admin/models')) {
    if(route.request().method()==='PUT') {
     writes++;saved=route.request().postDataJSON();const limits=saved.modelLimits[meta.id];
     Object.assign(meta,{contextWindow:limits.contextWindow,maxInputTokens:limits.maxInputTokens,outputCapabilityTokens:limits.maxOutputTokens,maxOutputTokens:limits.requestOutputTokens});
    }
    data={source:'runtime',restartRequired:false,providers:[provider],models:[meta],defaultModel:meta.id};
   }
   await route.fulfill({json:{success:true,data}});
  });
  const page = await context.newPage();
  page.on('pageerror',error=>report.errors.push({width,message:error.message}));
  await page.goto(base+'/admin/models');
  const editor=page.locator('[data-model="fixture-model"]');
  await expect(editor.getByLabel('上下文总上限')).toHaveValue('500000');
  await editor.getByLabel('上下文总上限').fill('1000000');await editor.getByLabel('最大输入（可选）').fill('1000000');
  await editor.getByLabel('模型最大输出').fill('128000');await editor.getByLabel('每次输出额度').fill('10000');
  await page.locator('button[type="submit"]').click();
  await expect.poll(()=>writes).toBe(1);
  expect(saved.modelLimits[meta.id]).toEqual({contextWindow:1000000,maxInputTokens:1000000,maxOutputTokens:128000,requestOutputTokens:10000});
  expect(saved.apiKey).toBeUndefined();
  await expect(editor.getByLabel('最大输入（可选）')).toHaveValue('1000000');
  // Native numeric validity plus shared validator must prevent excess request output.
  await editor.getByLabel('每次输出额度').fill('128001');await page.locator('button[type="submit"]').click();
  expect(writes).toBe(1);
  await editor.getByLabel('每次输出额度').fill('10000');await editor.getByLabel('每次输出额度').blur();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);expect(overflow).toBe(false);
  await page.screenshot({path:`${output}/${width}.png`,fullPage:true,animations:'disabled'});
  report.results.push({width,exactLimitsSaved:true,inputLimitRetained:true,keyUnchanged:true,invalidRequestBlocked:true,overflow});
  await context.close();
 }
 expect(report.errors).toEqual([]);
} finally {await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report));
