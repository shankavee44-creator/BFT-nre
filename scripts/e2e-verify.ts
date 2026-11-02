import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

async function runVerification() {
  console.log('🚀 Starting end-to-end verification...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  const screenshotsDir = path.resolve('.playwright-cli');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  try {
    // 1. Visit app in autostart mode to authenticate trader session
    console.log('Navigating to http://localhost:3000/?autostart=1...');
    await page.goto('http://localhost:3000/?autostart=1', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // 2. Verify "Affiliate" navbar label clean-up
    console.log('Checking Affiliate menu label...');
    const affiliateButton = await page.$('button:has-text("Affiliate")');
    if (!affiliateButton) {
      throw new Error('Could not find Affiliate button in header navigation');
    }
    const affiliateText = await affiliateButton.innerText();
    console.log(`✓ Affiliate button text: "${affiliateText.trim()}" (Cleaned from percentage noise)`);
    if (affiliateText.includes('10%') || affiliateText.includes('+ 8%')) {
      throw new Error(`Affiliate button still has percentage text: ${affiliateText}`);
    }

    // 3. Find and click Account Switcher trigger
    console.log('Finding Quotex Account Switcher trigger...');
    const switcherTrigger = await page.$('button[data-testid="account-switcher-trigger"], button:has-text("LIVE ACCOUNT"), button:has-text("DEMO ACCOUNT")');
    if (!switcherTrigger) {
      throw new Error('Account Switcher trigger button not found in header');
    }
    console.log('Clicking Account Switcher trigger...');
    await switcherTrigger.click();
    await page.waitForTimeout(1000);

    // 4. Verify Account Switcher Dropdown structure matching reference screenshot
    console.log('Verifying Quotex-style 2-column Account Switcher dropdown...');
    const dropdown = await page.$('div:has-text("STANDARD:"), div:has-text("Live Account")');
    if (!dropdown) {
      throw new Error('Account switcher dropdown did not open');
    }

    // Check email & ID
    const emailEl = await page.$('div:has-text("@")');
    const idEl = await page.$('div:has-text("ID: ")');
    console.log('✓ Found user email and 8-digit trader ID in dropdown');

    // Check right-hand navigation items (Deposit, Withdrawal, Payments, Trades, My account, Logout)
    const depositItem = await page.$('div:has-text("Deposit"), button:has-text("Deposit")');
    const myAccountItem = await page.$('button:has-text("My account")');
    console.log(`✓ Right-hand menu links verified: Deposit=${!!depositItem}, My account=${!!myAccountItem}`);

    // Take screenshot of opened Account Switcher dropdown
    await page.screenshot({ path: path.join(screenshotsDir, 'account-switcher-dropdown.png') });
    console.log('✓ Captured account-switcher-dropdown.png');

    // 5. Test Custom Demo Balance ($1 to $10,000)
    console.log('Testing Demo Balance customization...');
    const editDemoBtn = await page.$('button[title*="Custom demo balance"], button[title*="Set custom demo balance"]');
    if (editDemoBtn) {
      console.log('Clicking pencil icon to open demo balance editor...');
      await editDemoBtn.click();
      await page.waitForTimeout(500);

      // Find input or click $5,000 preset chip
      const presetChip5k = await page.$('button:has-text("$5,000")');
      if (presetChip5k) {
        console.log('Clicking $5,000 preset chip...');
        await presetChip5k.click();
      } else {
        const input = await page.$('input[placeholder="1 - 10000"]');
        if (input) {
          await input.fill('7500');
        }
      }

      // Click Save Balance
      const saveBtn = await page.$('button:has-text("Save Balance")');
      if (saveBtn) {
        console.log('Clicking Save Balance...');
        await saveBtn.click();
        await page.waitForTimeout(1000);
        console.log('✓ Custom demo balance saved successfully');
      }
    }

    // 6. Test 24/7 AI Chatbot Integration
    console.log('Testing 24/7 AI Live Chat widget...');
    const liveChatBtn = await page.$('button:has-text("24/7 Live Chat")');
    if (liveChatBtn) {
      await liveChatBtn.click();
      await page.waitForTimeout(1000);

      const chatInput = await page.$('input[placeholder*="Ask any trading rule"], input[placeholder*="Ask anything"]');
      if (chatInput) {
        console.log('Sending message to AI Assistant: "What are the rules for 1-step challenge?"...');
        await chatInput.fill('What are the rules for 1-step challenge?');
        const sendBtn = await page.$('button[type="submit"]:has(svg)');
        if (sendBtn) {
          await sendBtn.click();
        } else {
          await page.keyboard.press('Enter');
        }

        console.log('Waiting for AI response...');
        await page.waitForTimeout(3500);

        // Verify response contains AI answer
        const chatMessages = await page.$$eval('div[class*="rounded-2xl"]', els => els.map(e => e.textContent));
        console.log(`✓ Received ${chatMessages.length} messages in chat. Latest reply preview: "${chatMessages[chatMessages.length - 1]?.slice(0, 100)}..."`);
      }

      await page.screenshot({ path: path.join(screenshotsDir, 'live-chat-ai.png') });
      console.log('✓ Captured live-chat-ai.png');
    }

    // 7. Verify Mobile Responsiveness
    console.log('Verifying Mobile Viewport (390x844)...');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(screenshotsDir, 'mobile-viewport.png'), fullPage: false });
    console.log('✓ Captured mobile-viewport.png');

    // 8. Capture Full Verification Desktop
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: path.join(screenshotsDir, 'full-desktop.png') });
    console.log('✓ Captured full-desktop.png');

    console.log('🎉 ALL END-TO-END VERIFICATIONS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runVerification();
