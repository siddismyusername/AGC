export const projectSummary = [
  { label: 'Active projects', value: '12', delta: '+2 this month' },
  { label: 'Health score', value: '91.4', delta: '+4.2 vs last week' },
  { label: 'Critical violations', value: '3', delta: '-5 since yesterday' },
  { label: 'Pending reviews', value: '8', delta: '4 rule sets' },
];

export const recentProjects = [
  {
    name: 'Payments Core',
    branch: 'main',
    score: 96,
    status: 'healthy',
    violations: 1,
  },
  {
    name: 'Customer Portal',
    branch: 'release/2.3',
    score: 83,
    status: 'warning',
    violations: 6,
  },
  {
    name: 'Risk Engine',
    branch: 'develop',
    score: 71,
    status: 'attention',
    violations: 11,
  },
];

export const activityFeed = [
  'New architecture version activated for Payments Core.',
  'GitHub webhook reported a forbidden dependency in Customer Portal.',
  'Document upload processed into 14 candidate rules for Risk Engine.',
  'Architecture graph refreshed after static analysis run.',
];