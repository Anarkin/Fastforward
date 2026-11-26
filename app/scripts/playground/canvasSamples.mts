import { asObsidianWrites } from './obsidianCanvases.mts';

type Json = Readonly<Record<string, unknown>>;

type Side = 'top' | 'right' | 'bottom' | 'left';

function idsFrom(seed: number): () => string {
  let state = seed;
  return () => {
    let id = '';
    for (let digit = 0; digit < 16; digit++) {
      state = (state * 1103515245 + 12345) % 2147483648;
      id += (Math.floor(state / 65536) % 16).toString(16);
    }
    return id;
  };
}

function sketch(seed: number) {
  const id = idsFrom(seed);
  const nodes: Json[] = [];
  const edges: Json[] = [];
  const placed =
    (type: string, key: string) =>
    (
      value: string,
      x: number,
      y: number,
      width: number,
      height: number,
      more: Json = {},
    ) => {
      const made = id();
      nodes.push({
        id: made,
        type,
        [key]: value,
        x,
        y,
        width,
        height,
        ...more,
      });
      return made;
    };
  return {
    text: placed('text', 'text'),
    file: placed('file', 'file'),
    link: placed('link', 'url'),
    group: (
      label: string,
      x: number,
      y: number,
      width: number,
      height: number,
      more: Json = {},
    ) => {
      const made = id();
      nodes.push({
        id: made,
        type: 'group',
        x,
        y,
        width,
        height,
        label,
        ...more,
      });
      return made;
    },
    edge: (
      fromNode: string,
      fromSide: Side,
      toNode: string,
      toSide: Side,
      more: Json = {},
    ) => {
      edges.push({ id: id(), fromNode, fromSide, toNode, toSide, ...more });
    },
    written: () => asObsidianWrites(nodes, edges),
  };
}

function projectKickoff(): string {
  const { text, link, group, edge, written } = sketch(1201);
  group('Project kickoff — 12 March', -40, -40, 1320, 820);
  text(
    '## Attendees\n- Ana (PM)\n- Bence (backend)\n- Chloé (design)\n- Dev (QA)\n- me, taking notes',
    0,
    0,
    300,
    220,
  );
  text(
    '## Agenda\n1. Why this project\n2. Scope for Q2\n3. Risks\n4. Who does what',
    340,
    0,
    300,
    220,
  );
  const goals = text(
    '## Goals\n- Ship the self-service export by **June**\n- Cut support tickets about exports by half\n- No downtime for the migration',
    680,
    0,
    560,
    220,
    { color: '4' },
  );
  const risks = text(
    '## Risks\n- Legacy CSV format nobody owns\n- Data retention rules unclear (ask legal!)\n- Only one person knows the billing DB',
    0,
    280,
    420,
    240,
    { color: '1' },
  );
  const decisions = text(
    '## Decisions\n- Export runs async, emailed when ready\n- Keep CSV, add JSON later\n- Weekly sync on Tuesdays 10:00',
    480,
    280,
    420,
    240,
    { color: '5' },
  );
  const actions = text(
    '## Action items\n- [ ] Ana: write the one-pager by Fri\n- [ ] Bence: spike on async jobs\n- [ ] Chloé: sketch the export dialog\n- [x] Dev: list current export bugs',
    940,
    280,
    300,
    300,
    { color: '3' },
  );
  text('budget?? 💸', 40, 580, 160, 60, { color: '2' });
  text('who owns the CSV spec', 240, 600, 220, 60);
  text('Q2 deadline is firm', 500, 580, 200, 60, { color: '1' });
  link('https://example.com/tickets/EXP-142', 740, 600, 300, 120);
  edge(risks, 'right', decisions, 'left', { label: 'mitigated by' });
  edge(goals, 'bottom', actions, 'top');
  edge(decisions, 'right', actions, 'left');
  return written();
}

function weeklySync(): string {
  const { text, link, group, edge, written } = sketch(1902);
  text(
    '# Weekly sync — Tue 19 March\nnotes by me, corrections welcome',
    0,
    -140,
    560,
    100,
  );
  group('Done', 0, 0, 360, 560, { color: '4' });
  group('Doing', 400, 0, 360, 560, { color: '3' });
  group('Blocked', 800, 0, 360, 560, { color: '1' });
  text('Export dialog mockups ✔', 20, 40, 320, 80);
  text('Async job spike — works, ~2s for 10k rows', 20, 160, 320, 100);
  text('Fixed date format bug (#131)', 20, 300, 320, 80);
  const email = text('Email when an export is ready', 420, 40, 320, 80);
  text('Migration script for old CSV files\n50% done', 420, 160, 320, 100);
  text('Docs for the JSON format', 420, 300, 320, 80);
  const retention = text(
    'Retention rules — waiting on legal',
    820,
    40,
    320,
    100,
  );
  text('Staging DB too small for the load test', 820, 180, 320, 100);
  text('CI flaky on macOS again 😬', 1200, 40, 240, 80, { color: '2' });
  link('https://example.com/boards/exports', 0, 600, 360, 120);
  edge(email, 'right', retention, 'left', { label: 'waits on' });
  return written();
}

function brainstorm(): string {
  const { text, file, group, edge, written } = sketch(2703);
  const dark = text('Dark mode for the export dialog', -523, -311, 250, 60);
  const searches = text(
    'What if exports were just saved searches?',
    -180,
    -402,
    312,
    94,
    { color: '6' },
  );
  const paragraph = text(
    'Long thought: people export to get data into Excel, then they filter it there. If we let them filter before exporting, most exports get smaller and faster, and the async job matters less. Worth a prototype?',
    210,
    -260,
    400,
    180,
  );
  const share = text(
    '🔥 Hot idea: share a link instead of a file',
    -610,
    20,
    180,
    180,
    { color: '2' },
  );
  text('overlaps the hot idea on purpose', -520, 60, 220, 80);
  file('notes/idea.md', -240, 80, 400, 240);
  text('?', 680, -120, 60, 60);
  group('Parking lot', 200, 120, 520, 300);
  text('API for exports', 240, 160, 200, 60);
  text('Scheduled exports', 480, 160, 200, 60);
  text('Export to Google Sheets', 240, 260, 220, 60, { color: '3' });
  edge(searches, 'right', paragraph, 'left', { label: 'builds on' });
  edge(share, 'top', dark, 'left', { label: 'contradicts?', color: '1' });
  edge(paragraph, 'bottom', searches, 'bottom');
  return written();
}

function webApp(): string {
  const { text, group, edge, written } = sketch(3104);
  group('Edge', -40, -40, 400, 620);
  const browser = text('🌐 Browser\nReact SPA', 0, 0, 320, 100);
  const cdn = text('CDN\nstatic assets, cached for a day', 0, 200, 320, 100);
  const balancer = text('Load balancer\nTLS ends here', 0, 400, 320, 100);
  const app = group('App tier', 440, 160, 400, 560, { color: '5' });
  const first = text('API server #1\nNode.js', 480, 200, 320, 80);
  const second = text('API server #2\nNode.js', 480, 320, 320, 80);
  const third = text('API server #3\nNode.js', 480, 440, 320, 80);
  const worker = text('Background worker\nexports, emails', 480, 580, 320, 100);
  group('Data tier', 920, 160, 420, 620, { color: '6' });
  const primary = text('PostgreSQL primary', 960, 200, 340, 80);
  const replica = text('PostgreSQL replica\nread-only', 960, 340, 340, 80);
  const redis = text('Redis\nsessions and cache', 960, 480, 340, 80);
  const bucket = text('S3 bucket\nuploads and exports', 960, 620, 340, 100);
  edge(browser, 'bottom', cdn, 'top', { label: 'HTTPS' });
  edge(cdn, 'bottom', balancer, 'top', { label: 'cache miss' });
  edge(balancer, 'right', app, 'left', { label: 'round robin' });
  edge(first, 'right', primary, 'left', { label: 'SQL' });
  edge(second, 'right', replica, 'left', { label: 'reads' });
  edge(third, 'right', redis, 'left');
  edge(primary, 'bottom', replica, 'top', { label: 'replication', color: '6' });
  edge(worker, 'right', bucket, 'left', { label: 'PUT' });
  return written();
}

function eventPipeline(): string {
  const { text, link, group, edge, written } = sketch(4005);
  group('Producers', 0, 0, 360, 420);
  const orders = text('Orders service', 40, 40, 280, 80, { color: '5' });
  const payments = text('Payments service', 40, 160, 280, 80, { color: '5' });
  const inventory = text('Inventory service', 40, 280, 280, 80, { color: '5' });
  group('Kafka', 440, 0, 380, 540, { color: '2' });
  const ordersTopic = text(
    'topic: orders.v1\n12 partitions',
    480,
    40,
    300,
    100,
  );
  const paymentsTopic = text('topic: payments.v1', 480, 180, 300, 80);
  const stockTopic = text('topic: stock.v1', 480, 300, 300, 80);
  const deadLetters = text('dead letters\nretried hourly', 480, 420, 300, 80, {
    color: '1',
  });
  group('Consumers', 900, 0, 380, 540);
  const analytics = text('Analytics loader', 940, 40, 300, 80);
  const emailer = text('Email notifier', 940, 160, 300, 80);
  const indexer = text('Search indexer', 940, 280, 300, 80);
  const warehouse = text('Warehouse\n(BigQuery)', 1360, 40, 260, 100, {
    color: '6',
  });
  const provider = link(
    'https://example.com/email-provider',
    1360,
    160,
    260,
    80,
  );
  const search = text('Elasticsearch', 1360, 280, 260, 80, { color: '6' });
  edge(orders, 'right', ordersTopic, 'left', { label: 'publish' });
  edge(payments, 'right', paymentsTopic, 'left');
  edge(inventory, 'right', stockTopic, 'left');
  edge(ordersTopic, 'right', analytics, 'left');
  edge(ordersTopic, 'right', emailer, 'left');
  edge(paymentsTopic, 'right', analytics, 'left');
  edge(stockTopic, 'right', indexer, 'left');
  edge(emailer, 'right', provider, 'left', { label: 'SMTP' });
  edge(analytics, 'right', warehouse, 'left', { label: 'batch, hourly' });
  edge(indexer, 'right', search, 'left');
  edge(emailer, 'bottom', deadLetters, 'right', {
    label: 'on failure',
    color: '1',
  });
  return written();
}

function systemContext(): string {
  const { text, group, edge, written } = sketch(5306);
  const customer = text('👤 Customer\nbuys things online', 0, 0, 280, 120);
  const agent = text('👤 Support agent\nhelps customers', 0, 400, 280, 120);
  group('Shop — the system we build', 400, -40, 560, 600, { color: '5' });
  const shop = text('Web shop\nbrowse, order, pay', 440, 0, 480, 120);
  const core = text(
    'Order core\nthe source of truth for orders',
    440,
    200,
    480,
    120,
  );
  const office = text(
    'Back office\nrefunds, order changes',
    440,
    400,
    480,
    120,
  );
  const payments = text('Payment provider\n(external)', 1080, 0, 300, 120, {
    color: '#888888',
  });
  const email = text('Email service\n(external)', 1080, 200, 300, 120, {
    color: '#888888',
  });
  const erp = text('Warehouse ERP\n(external, SOAP 😩)', 1080, 400, 300, 120, {
    color: '#888888',
  });
  edge(customer, 'right', shop, 'left', { label: 'uses (HTTPS)' });
  edge(agent, 'right', office, 'left', { label: 'uses' });
  edge(shop, 'bottom', core, 'top', { label: 'places orders' });
  edge(office, 'top', core, 'bottom', { label: 'changes orders' });
  edge(shop, 'right', payments, 'left', {
    label: 'takes payment',
    fromEnd: 'arrow',
  });
  edge(core, 'right', email, 'left', { label: 'sends receipts' });
  edge(core, 'right', erp, 'left', {
    label: 'syncs stock',
    fromEnd: 'arrow',
    toEnd: 'arrow',
  });
  return written();
}

export const meetingCanvases: Readonly<Record<string, () => string>> = {
  'project-kickoff': projectKickoff,
  'weekly-sync': weeklySync,
  brainstorm,
};

export const architectureCanvases: Readonly<Record<string, () => string>> = {
  'web-app': webApp,
  'event-pipeline': eventPipeline,
  'system-context': systemContext,
};
