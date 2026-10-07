import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

function Section({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-[var(--color-surface)] rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[var(--color-surface-hover)] transition min-h-[48px]"
      >
        <span className="text-sm font-semibold text-white">{title}</span>
        {open ? <ChevronDown size={16} className="text-[var(--color-muted)]" /> : <ChevronRight size={16} className="text-[var(--color-muted)]" />}
      </button>
      {open && <div className="px-4 pb-4 text-sm text-gray-300 space-y-3">{children}</div>}
    </div>
  )
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 items-start">
      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--color-primary)] text-white text-xs font-bold flex items-center justify-center mt-0.5">{n}</span>
      <div>{children}</div>
    </div>
  )
}

export default function HelpPage() {
  return (
    <div className="p-4 md:p-6 max-w-2xl md:max-w-5xl">
      <h1 className="text-xl font-bold mb-1">Help & Guide</h1>
      <p className="text-sm text-[var(--color-muted)] mb-6">How to use the ST Mobile CRM. Tap any section to expand it.</p>

      <div className="space-y-3">

        {/* SCHEDULE */}
        <Section title="📅 Schedule" defaultOpen={true}>
          <p>The Schedule page is your home screen. It pulls in today's jobs from Google Calendar so you can see what's on deck.</p>

          <div className="space-y-2">
            <p className="font-medium text-white">Day vs Week view</p>
            <p>Toggle between <span className="text-white font-medium">Day</span> and <span className="text-white font-medium">Week</span> at the top. Day view shows full job cards. Week view shows a summary — tap any day to jump to it.</p>
          </div>

          <div className="space-y-2">
            <p className="font-medium text-white">Job cards</p>
            <p>Each card shows the shop name, time, vehicle info, tech assigned, and address. Tap the address to open it in Maps for directions.</p>
          </div>

          <div className="space-y-2">
            <p className="font-medium text-white">Creating a job from the schedule</p>
            <p>If a calendar event doesn't have a CRM job yet, you'll see a <span className="text-[var(--color-primary)]">Create Job</span> button. Tap it and the job form auto-fills with the shop name, vehicle, tech, and everything from the calendar — just review and save.</p>
            <p>Events that already have a job show <span className="text-green-400">✓ Job created</span> — tap to open it.</p>
          </div>
        </Section>

        {/* JOBS */}
        <Section title="🔧 Jobs">
          <div className="space-y-2">
            <p className="font-medium text-white">Finding jobs</p>
            <p>Three views at the top:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><span className="text-white">Today</span> — only jobs scheduled for today</li>
              <li><span className="text-white">Active</span> — everything that's still in progress (no completed/paid/cancelled)</li>
              <li><span className="text-white">All</span> — full history with date and status filters</li>
            </ul>
            <p>Use the search bar to find jobs by shop name, vehicle, VIN, or description.</p>
          </div>

          <div className="space-y-2">
            <p className="font-medium text-white">Creating a new job</p>
            <p>Two ways:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><span className="text-white">From the Schedule</span> — tap "Create Job" on a calendar event (recommended, auto-fills everything)</li>
              <li><span className="text-white">Manually</span> — tap the <span className="text-[var(--color-primary)]">+ New Job</span> button on the Jobs page</li>
            </ul>
          </div>

          <div className="space-y-2">
            <p className="font-medium text-white">Import from QuickBooks</p>
            <p>If a job was already invoiced in QB before the CRM, tap <span className="text-white">Import from QB</span> and enter the invoice number. It'll create the job from the existing invoice data.</p>
          </div>

          <div className="space-y-2">
            <p className="font-medium text-white">NASTF Authorizations</p>
            <p>On the Jobs page, toggle the <span className="text-white">NASTF Auths</span> view to see all submitted authorization forms (customer, contractor, and fleet). Each auth shows the customer info, vehicle, and submission date.</p>
            <p>Tap the <span className="text-white">Print / PDF</span> button on any auth to generate a clean printable version with all fields and the customer's signature — ready to attach to a NASTF D1 request.</p>
          </div>
        </Section>

        {/* WORKING A JOB */}
        <Section title="📝 Working a Job (Job Detail)">
          <p>Tap any job to open the detail view. This is where you manage everything about the job.</p>

          <div className="space-y-2">
            <p className="font-medium text-white">Vehicles</p>
            <p>Vehicles show at the top. To add one:</p>
            <Step n={1}><p>Tap <span className="text-[var(--color-primary)]">+ Add vehicle</span></p></Step>
            <Step n={2}><p>Type or scan the VIN — it auto-decodes the year, make, model, and engine when you hit 17 characters</p></Step>
            <Step n={3}><p>No VIN? Tap "Don't have the VIN? Enter manually" and fill in what you know (make is required)</p></Step>
            <p>To remove a vehicle, tap the X next to it.</p>
          </div>

          <div className="space-y-2">
            <p className="font-medium text-white">Adding services / line items</p>
            <Step n={1}><p>Tap the search bar under Services and start typing (e.g. "diagnostic" or "BCM")</p></Step>
            <Step n={2}><p>Pick from the catalog — it auto-fills the description, price, and QB link</p></Step>
            <Step n={3}><p>Adjust quantity or price if needed</p></Step>
            <Step n={4}><p>Tap <span className="text-white font-medium">Save Services</span> when done</p></Step>
            <p>If the job has multiple vehicles, you can assign each line item to a specific vehicle using the dropdown.</p>
          </div>

          <div className="space-y-2">
            <p className="font-medium text-white">Notes</p>
            <p>Use the <span className="text-white">Internal Notes</span> field for anything you want to track — diagnostic findings, parts needed, follow-up info. Tap <span className="text-white font-medium">Save Details</span> after editing.</p>
          </div>

          <div className="space-y-2">
            <p className="font-medium text-white">Status</p>
            <p>The status dropdown is in the top-right corner. It usually updates itself:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><span className="text-yellow-400">In Progress</span> — default when created</li>
              <li><span className="text-green-400">Complete</span> — set manually when work is done</li>
              <li><span className="text-blue-400">Invoiced</span> — auto-set when you send an invoice to QB</li>
              <li><span className="text-emerald-400">Paid</span> — auto-set when payment is recorded</li>
              <li><span className="text-gray-400">Cancelled</span> — if the job was cancelled</li>
            </ul>
          </div>

          <div className="space-y-2">
            <p className="font-medium text-white">Photos and files</p>
            <p>Scroll down to the Attachments section. Tap to upload photos or documents from your phone. These show up on the shared job link the shop can see.</p>
          </div>

          <div className="space-y-2">
            <p className="font-medium text-white">Tech assignment</p>
            <p>Tap the tech name to reassign the job to a different tech.</p>
          </div>

          <div className="space-y-2">
            <p className="font-medium text-white">Sharing with the shop</p>
            <p>At the bottom of the job detail, there's a <span className="text-white">Share</span> section with a copyable link. Send this to the shop — they can see the job summary, photos, and pay online.</p>
          </div>

          <div className="space-y-2">
            <p className="font-medium text-white">Printable invoice</p>
            <p>After invoicing, a <span className="text-white">Print Invoice</span> button appears. It generates a clean, printable invoice with the ST Mobile logo, line items, totals, and tax. Use it to hand off a paper receipt or save as PDF.</p>
          </div>
        </Section>

        {/* INVOICING */}
        <Section title="💰 Invoicing & Payments">
          <div className="space-y-2">
            <p className="font-medium text-white">Sending an invoice</p>
            <Step n={1}><p>Make sure all services are added and saved</p></Step>
            <Step n={2}><p>Tap <span className="text-white font-medium">Send Invoice to QuickBooks</span></p></Step>
            <Step n={3}><p>Confirm — this auto-saves your line items, creates the invoice in QB, and updates the status to Invoiced</p></Step>
            <p className="text-yellow-400/80">⚠️ Any line items without a QB link (not from the service catalog) will be skipped. Use canned services whenever possible.</p>
          </div>

          <div className="space-y-2">
            <p className="font-medium text-white">Insurance jobs</p>
            <p>Toggle on <span className="text-white">Insurance Job</span> before invoicing. This creates:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>An estimate at full price (for the insurance company)</li>
              <li>An invoice at 20% off (what the shop actually pays)</li>
            </ul>
          </div>

          <div className="space-y-2">
            <p className="font-medium text-white">Collecting payment</p>
            <p>After invoicing, a payment dialog pops up:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><span className="text-white">Cash</span> or <span className="text-white">Check</span> — records the payment in QB immediately</li>
              <li><span className="text-white">Online</span> — the shop pays through the QB invoice link (payment records automatically)</li>
            </ul>
          </div>

          <div className="space-y-2">
            <p className="font-medium text-white">Updating an invoice</p>
            <p>If you change line items after invoicing, tap <span className="text-white font-medium">Re-sync to QuickBooks</span> to push the changes to the existing invoice.</p>
          </div>
        </Section>

        {/* FOLLOW-UPS */}
        <Section title="🔔 Follow-Ups">
          <p>The Follow-Ups tab tracks items that need action — callbacks, pending parts, waiting on customer approval, etc.</p>

          <div className="space-y-2">
            <p className="font-medium text-white">Creating a follow-up</p>
            <p>From any job detail page, tap <span className="text-white font-medium">+ Follow-Up</span> to flag it for follow-up. Add a reason so anyone on the team knows what needs to happen.</p>
          </div>

          <div className="space-y-2">
            <p className="font-medium text-white">Adding updates</p>
            <p>Tap <span className="text-white font-medium">Update</span> on any open follow-up to log a note — e.g. "Called, no answer" or "Parts ordered, ETA Thursday". Updates show inline with your name and timestamp so the team can see the history.</p>
          </div>

          <div className="space-y-2">
            <p className="font-medium text-white">Resolving</p>
            <p>Once the follow-up is handled, tap <span className="text-white font-medium">Resolve</span> to close it. Resolved follow-ups are automatically deleted after 60 days to keep the list clean.</p>
          </div>

          <div className="space-y-2">
            <p className="font-medium text-white">Who sees follow-ups?</p>
            <p>Everyone on the team. The bell icon in the bottom nav shows follow-ups for all employees.</p>
          </div>
        </Section>

        {/* TASKS */}
        <Section title="✅ Tasks (Sean & Mike)">
          <p>The Tasks tab is a shared task list visible only to Sean and Mike. It's organized by category and supports recurring items.</p>

          <div className="space-y-2">
            <p className="font-medium text-white">Categories</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><span className="text-white">🔴 Priority</span> — urgent, same-day items</li>
              <li><span className="text-white">📅 Weekly</span> — recurring weekly tasks (auto-reset every Monday)</li>
              <li><span className="text-white">📆 Monthly</span> — recurring monthly tasks (auto-reset on the 1st)</li>
              <li><span className="text-white">🔄 Ongoing</span> — persistent items to check regularly</li>
              <li><span className="text-white">💡 Future</span> — low-priority backlog items</li>
            </ul>
          </div>

          <div className="space-y-2">
            <p className="font-medium text-white">Managing tasks</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><span className="text-white">Check/uncheck</span> — tap the circle to complete or reopen a task</li>
              <li><span className="text-white">Edit</span> — tap the pencil icon to change the title, description, category, recurrence, or links</li>
              <li><span className="text-white">Update</span> — add notes/status updates that show inline with timestamps</li>
              <li><span className="text-white">Drag & drop</span> — hold the ⠿ handle to reorder tasks within a category</li>
              <li><span className="text-white">Links</span> — attach Google Drive links (sheets, docs) to any task</li>
              <li><span className="text-white">Delete</span> — tap the X to remove a task permanently</li>
            </ul>
          </div>

          <div className="space-y-2">
            <p className="font-medium text-white">Recurring tasks</p>
            <p>Weekly and monthly tasks auto-reset when a new period starts. If you completed "Deposit checks" last week, it'll show as open again on Monday — no need to recreate it.</p>
          </div>
        </Section>

        {/* CUSTOMERS */}
        <Section title="👥 Customers">
          <div className="space-y-2">
            <p className="font-medium text-white">Finding a customer</p>
            <p>Search by name, phone, or email. Tap a customer to see their full profile, vehicles, and job history.</p>
          </div>

          <div className="space-y-2">
            <p className="font-medium text-white">Adding a customer</p>
            <p>Tap <span className="text-[var(--color-primary)]">+ Add Customer</span>. Choose Shop or Individual — shops need a shop name and address, individuals just need a name and phone.</p>
            <p>The system checks for duplicates automatically so you don't create the same customer twice.</p>
          </div>

          <div className="space-y-2">
            <p className="font-medium text-white">Customer portal</p>
            <p>Each customer has a portal link (on their detail page). Share it with the shop — they can see all their completed jobs, payment status, and pay invoices online.</p>
          </div>

          <div className="space-y-2">
            <p className="font-medium text-white">Red flag</p>
            <p>If a customer has issues (non-payment, problems, etc.), toggle the red flag on their profile. This shows a ⚠️ warning on their name throughout the app.</p>
          </div>
        </Section>

        {/* BONUS TRACKER */}
        <Section title="📊 Bonus Tracker">
          <p>Shows the current month's company profit and where you land on the bonus scale.</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><span className="text-white">Under $14k profit</span> — no bonus</li>
            <li><span className="text-white">$14k–$20k profit</span> — 2% to 4% (scales up as profit grows)</li>
            <li><span className="text-white">$20k+ profit</span> — 4% max rate</li>
          </ul>
          <p>The bonus is calculated as the rate times your annual salary per month. The projection shows where the month is heading based on current pace. Tap <span className="text-white">Refresh</span> to pull the latest numbers from QuickBooks.</p>
        </Section>

        {/* SERVICES */}
        <Section title="🗂️ Service Catalog">
          <p>The service catalog is the list of canned services (like "BCM Programming" or "Full Diagnostic"). These are templates — when you add one to a job, it auto-fills the description, price, and QB item link.</p>
          <p><span className="text-white font-medium">Always use services from the catalog</span> when possible. This ensures the line items sync properly to QuickBooks invoices. Custom/manual items without a QB link get skipped during invoicing.</p>
          <p>Only admins should add or edit services here — talk to Sean if something's missing from the catalog.</p>
          <div className="space-y-2">
            <p className="font-medium text-white">Yearly view</p>
            <p>The Service Lines page also has a <span className="text-white">Yearly</span> tab that shows revenue per service line across the year — useful for seeing what's growing and what's slowing down.</p>
          </div>
        </Section>

        {/* NAVIGATION */}
        <Section title="📱 Navigation">
          <div className="space-y-2">
            <p className="font-medium text-white">Bottom bar (mobile)</p>
            <p>The most-used pages are always visible: Schedule, Jobs, Follow-Ups, Bonus, and Tasks (Sean & Mike only). The Financial Advisor tab is visible to Sean only.</p>
          </div>

          <div className="space-y-2">
            <p className="font-medium text-white">More menu</p>
            <p>Tap the <span className="text-white">⋯ More</span> button to access Customers, Services, Settings, and Help. Sign Out is also in this menu.</p>
          </div>

          <div className="space-y-2">
            <p className="font-medium text-white">Desktop sidebar</p>
            <p>On desktop, all pages are visible in the left sidebar — no More menu needed.</p>
          </div>
        </Section>

        {/* TEAM & SETTINGS */}
        <Section title="⚙️ Settings">
          <div className="space-y-2">
            <p className="font-medium text-white">Team</p>
            <p>Shows everyone on the team with their role, phone number, and assigned color. The color shows up on calendar events and job assignments so you can quickly see who's working what.</p>
            <p>Tap a phone number to call directly.</p>
          </div>

          <div className="space-y-2">
            <p className="font-medium text-white">QuickBooks</p>
            <p>Shows the QB connection status. If it ever disconnects, you can reconnect from here. The "Test Connection" button verifies everything is still working.</p>
          </div>

          <div className="space-y-2">
            <p className="font-medium text-white">Password</p>
            <p>You can reset your CRM password from the login screen. Tap "Forgot password?" and enter your email — you'll get a reset link. If you need to change your password while logged in, ask Sean.</p>
          </div>
        </Section>

        {/* TIPS */}
        <Section title="💡 Tips & Shortcuts">
          <ul className="list-disc list-inside space-y-2 ml-2">
            <li><span className="text-white">Add to home screen</span> — open the CRM in your phone's browser, tap Share → "Add to Home Screen". It works like an app after that.</li>
            <li><span className="text-white">VIN scanning</span> — use your phone's camera/keyboard VIN scanner to paste into the VIN field. It auto-decodes at 17 characters.</li>
            <li><span className="text-white">Tap phone numbers</span> to call directly from the app.</li>
            <li><span className="text-white">Tap addresses</span> to open in Google Maps for directions.</li>
            <li><span className="text-white">Unsaved changes</span> — if you have unsaved edits and try to leave, the app warns you so you don't lose work.</li>
            <li><span className="text-white">Past-due warning</span> — if a customer has an outstanding balance in QB, you'll see a red banner at the top of their job. Collect before doing more work.</li>
            <li><span className="text-white">Print auth forms</span> — on the NASTF Auths view, tap Print/PDF on any submission to get a clean printable version for D1 requests.</li>
            <li><span className="text-white">Print invoices</span> — after invoicing a job, use the Print Invoice button for a paper copy or PDF.</li>
          </ul>
        </Section>

        {/* FAQ */}
        <Section title="❓ Common Questions">
          <div className="space-y-4">
            <div>
              <p className="font-medium text-white">Why did a line item get skipped on the invoice?</p>
              <p>It doesn't have a QuickBooks link. Use a service from the catalog instead of typing a custom description. If the service you need isn't in the catalog, ask Sean to add it.</p>
            </div>
            <div>
              <p className="font-medium text-white">How do I fix an invoice I already sent?</p>
              <p>Edit the line items on the job, save them, then tap "Re-sync to QuickBooks". This updates the existing invoice — it doesn't create a new one.</p>
            </div>
            <div>
              <p className="font-medium text-white">A calendar event isn't showing up</p>
              <p>Tap the refresh button on the Schedule page. If it still doesn't show, check that the event is on the right Google Calendar and has today's date.</p>
            </div>
            <div>
              <p className="font-medium text-white">How do I add a vehicle without a VIN?</p>
              <p>On the job detail, tap "+ Add vehicle" then "Don't have the VIN? Enter manually". Make is required — fill in year and model if you have them.</p>
            </div>
            <div>
              <p className="font-medium text-white">What's the difference between Shop and Individual customers?</p>
              <p>Shops are the repair shops we service — they have a shop name and full address. Individuals are direct customers (rare). Most of our customers are shops.</p>
            </div>
            <div>
              <p className="font-medium text-white">Can the shop see my internal notes?</p>
              <p>No. Internal notes are only visible to our team. The shared job link only shows the services performed, photos, and documents.</p>
            </div>
            <div>
              <p className="font-medium text-white">How do I share a job with the shop?</p>
              <p>Open the job, scroll to the Share section at the bottom, and copy the link. Send it to the shop via text or email. They can see the job summary, photos, and pay online.</p>
            </div>
            <div>
              <p className="font-medium text-white">What happens to completed follow-ups?</p>
              <p>Resolved follow-ups stay visible for 60 days, then are automatically deleted to keep the list manageable.</p>
            </div>
            <div>
              <p className="font-medium text-white">Do weekly/monthly tasks reset automatically?</p>
              <p>Yes. Weekly tasks reset every Monday and monthly tasks reset on the 1st. You don't need to manually reopen them.</p>
            </div>
            <div>
              <p className="font-medium text-white">I forgot my password</p>
              <p>On the login screen, tap "Forgot password?" and enter your email. You'll get a reset link. If you're not getting the email, check spam or ask Sean.</p>
            </div>
          </div>
        </Section>

      </div>

      <p className="text-xs text-[var(--color-muted)] text-center mt-8 mb-4">Questions? Ask Sean or send a message in the group chat.</p>
    </div>
  )
}