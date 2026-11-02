// Playwright snippet executed in playwright-cli
const affiliateBtn = await page.$('button:has-text("Affiliate")');
const text = affiliateBtn ? await affiliateBtn.innerText() : 'NOT_FOUND';
console.log('AFFILIATE_NAV_TEXT: ' + text);

// Click Account Switcher
const trigger = await page.$('button[data-testid="account-switcher-trigger"]');
if (trigger) {
  console.log('FOUND TRIGGER, CLICKING...');
  await trigger.click();
} else {
  console.log('TRIGGER NOT FOUND');
}

await page.waitForTimeout(1000);
await page.screenshot({ path: '.playwright-cli/account-switcher-open.png' });
console.log('SCREENSHOT SAVED to .playwright-cli/account-switcher-open.png');
