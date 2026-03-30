import { chromium } from 'playwright';

const submissions = [
  {
    firstName: 'Stanley',
    lastName: 'Madziyire',
    email: 'stanley@uwindsor.ca',
    subject: 'General Questions',
    message: 'Hi, I had a general question about the event schedule. Thanks!',
  },
  {
    firstName: 'Curtis',
    lastName: 'Mahoney',
    email: 'curtis@uwindsor.ca',
    subject: 'Sponsorship Opportunities',
    message: 'Our company is interested in sponsoring the event. Who should we contact?',
  },
  {
    firstName: 'Danielle',
    lastName: 'Lenarduzzi',
    email: 'danielle@uwindsor.ca',
    subject: 'Speaker Inquiries',
    message: 'I would love to speak at the upcoming conference. Is there still availability?',
  },
  {
    firstName: 'James',
    lastName: 'Okonkwo',
    email: 'james@uwindsor.ca',
    subject: 'Tickets & Registration',
    message: 'Are group discounts available for student organizations?',
  },
  {
    firstName: 'Priya',
    lastName: 'Sharma',
    email: 'priya@uwindsor.ca',
    subject: 'General Questions',
    message: 'Is the venue wheelchair accessible? Also, will there be parking available?',
  },
];

const context = await chromium.launchPersistentContext(
  'C:\\Users\\stanm\\AppData\\Local\\Microsoft\\Edge\\User Data',
  {
    channel: 'msedge',
    headless: false,
    args: ['--profile-directory=Default'],
  }
);

await new Promise(r => setTimeout(r, 3000));

// Create our automation tab first so the window stays open even if we close
// restored tabs (closing all tabs can make Edge appear to "close/reopen").
const page = await context.newPage();

// Close any leftover/restored tabs to reduce interference.
for (const p of context.pages()) {
  if (p === page) continue;
  try { await p.close(); } catch {}
}

const isDryRun = process.env.DRY_RUN === '1';

for (let i = 0; i < submissions.length; i++) {
  const s = submissions[i];
  console.log(`\n📝 Submission ${i + 1}/5: ${s.firstName} ${s.lastName}`);

  // Navigate to the form
  let navigated = false;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await page.goto('https://nsbewindsor.ca/#contact', {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      });
      await page.waitForSelector('input[placeholder="Jane"]', { timeout: 30000 });
      navigated = true;
      break;
    } catch {
      try {
        await page.keyboard.press('Control+l');
        await page.keyboard.type('https://nsbewindsor.ca/#contact', { delay: 20 });
        await page.keyboard.press('Enter');
        await page.waitForSelector('input[placeholder="Jane"]', { timeout: 30000 });
        navigated = true;
        break;
      } catch {}
    }
  }
  if (!navigated) throw new Error('Failed to navigate to contact form');

  // Fill in the form
  await page.fill('input[placeholder="Jane"]', s.firstName);
  await page.fill('input[placeholder="Doe"]',  s.lastName);
  await page.fill('input[type="email"]',        s.email);
  await page.selectOption('select',             s.subject);
  await page.fill('textarea',                   s.message);

  // Submit
  if (!isDryRun) {
    await page.click('button:has-text("Send Message")');
    console.log(`   ✅ Submitted!`);
  } else {
    console.log(`   🧪 DRY_RUN=1 set: skipping submit click`);
  }

  // Wait for form to reset before next submission
  if (!isDryRun) {
    await page.waitForFunction(() => {
      const input = document.querySelector('input[placeholder="Jane"]');
      return input && input.value === '';
    }, { timeout: 10000 });
  }

  // Small delay between submissions
  if (i < submissions.length - 1) {
    await new Promise(r => setTimeout(r, 1500));
  }
}

console.log('\n🎉 All 5 submissions complete!');
await context.close();
