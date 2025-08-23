import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const artifactsDir = path.resolve(__dirname, '../test-artifacts');
const consoleLog = path.join(artifactsDir, 'console.log');
const networkLog = path.join(artifactsDir, 'network.log');
const errorsLog = path.join(artifactsDir, 'errors.log');
const deployedPath = path.join(artifactsDir, 'deployed.json');

function append(file: string, line: string){ fs.appendFileSync(file, line + '\n'); }

test('Deploy REF on BSC mainnet via wallet extension', async ({ page }) => {
  if(!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });
  [consoleLog, networkLog, errorsLog].forEach(p=> { try{ fs.unlinkSync(p); }catch{} });

  page.on('console', msg => append(consoleLog, `[${msg.type()}] ${msg.text()}`));
  page.on('request', req => append(networkLog, `>> ${req.method()} ${req.url()}`));
  page.on('response', res => append(networkLog, `<< ${res.status()} ${res.url()}`));
  page.on('requestfailed', req => append(networkLog, `!! ${req.failure()?.errorText} ${req.url()}`));

  await page.goto('https://gettoken.nl/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#view-connect', { state: 'visible' });

  // Connect via extension: pause
  await page.getByRole('button', { name: 'Подключить кошелёк' }).click();
  await page.getByRole('button', { name: 'Подключить через расширение' }).click();
  process.stdout.write('\nИмпортируйте ключ в расширение, подтвердите подключение и нажмите ENTER... ');
  await new Promise<void>(resolve => process.stdin.once('data', () => resolve()));

  await page.waitForFunction(() => (window as any).APP_STATE?.address && (window as any).APP_STATE?.network === 56, { timeout: 60_000 });

  // Fill deploy
  await page.getByPlaceholder('Название').fill('REF');
  await page.getByPlaceholder('Символ').fill('REF');
  await page.getByPlaceholder('Decimals').fill('9');
  await page.getByPlaceholder('Начальный выпуск').fill('11000000');

  // Submit and pause for tx confirmation
  await page.getByRole('button', { name: 'Создать токен' }).click();
  process.stdout.write('\nПодтвердите транзакцию в кошельке и нажмите ENTER... ');
  await new Promise<void>(resolve => process.stdin.once('data', () => resolve()));

  await page.waitForSelector('#token-address', { state: 'visible', timeout: 180_000 });
  const address = await page.locator('#token-address').textContent();
  expect(address && address.startsWith('0x') && address.length === 42).toBeTruthy();

  const result = { address, chainId:56, name:'REF', symbol:'REF', decimals:9 } as any;
  fs.writeFileSync(deployedPath, JSON.stringify(result, null, 2));

  // Print explorer link in stdout
  const link = await page.evaluate(() => (window as any).getExplorerBase?.((window as any).APP_STATE?.network || 56));
  console.log(`Explorer: ${link}/address/${address}`);
});
