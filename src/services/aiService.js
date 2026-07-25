const DISEASES = [
  { name: 'Atelectasis', description: 'Partial or complete collapse of lung tissue.' },
  { name: 'Cardiomegaly', description: 'Enlargement of the heart silhouette.' },
  { name: 'Effusion', description: 'Fluid accumulation in the pleural space.' },
  { name: 'Infiltration', description: 'Substance denser than air present in the lung.' },
  { name: 'Mass', description: 'A larger, discrete lung lesion.' },
  { name: 'Nodule', description: 'A small round lesion in the lung.' },
  { name: 'Pneumonia', description: 'Infection causing inflammation in the air sacs.' },
  { name: 'Pneumothorax', description: 'Air in the pleural space causing lung collapse.' },
  { name: 'Consolidation', description: 'Region of lung filled with liquid instead of air.' },
  { name: 'Edema', description: 'Excess fluid buildup in the lung tissue.' },
  { name: 'Emphysema', description: 'Damage to air sacs reducing lung elasticity.' },
  { name: 'Fibrosis', description: 'Scarring of lung tissue.' },
  { name: 'Pleural_Thickening', description: 'Thickening of the pleural lining.' },
  { name: 'Hernia', description: 'Diaphragmatic herniation of abdominal contents.' }
];

const CRITICAL_NAMES = ['Pneumonia', 'Mass', 'Pneumothorax', 'Cardiomegaly'];

const RECS = {
  low: ['Routine follow-up as clinically indicated', 'No immediate action required'],
  medium: ['Clinical correlation advised', 'Consider follow-up imaging in 4-6 weeks'],
  high: ['Urgent radiologist review recommended', 'Correlate with clinical symptoms immediately']
};

function recommendationsFor(prob) {
  if (prob >= 70) return RECS.high;
  if (prob >= 40) return RECS.medium;
  return RECS.low;
}

function colorFor(prob) {
  if (prob >= 70) return '#EF4444';
  if (prob >= 40) return '#F59E0B';
  return '#10B981';
}

async function mockAnalysis() {
  // simulate model inference latency
  await new Promise((resolve) => setTimeout(resolve, 1200 + Math.random() * 800));

  const scored = DISEASES.map((d) => ({
    ...d,
    probability: Math.round(Math.random() * 100 * 100) / 100
  }));

  const NOISE_FLOOR = 15;
  let findings = scored
    .filter((d) => d.probability >= NOISE_FLOOR)
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 6)
    .map((d) => ({
      name: d.name,
      probability: d.probability,
      color: colorFor(d.probability),
      description: d.description,
      recommendations: recommendationsFor(d.probability),
      boundingBox: {
        x: Math.round(Math.random() * 40 + 10),
        y: Math.round(Math.random() * 40 + 10),
        width: Math.round(Math.random() * 30 + 15),
        height: Math.round(Math.random() * 30 + 15)
      }
    }));

  if (findings.length === 0) {
    findings = [
      {
        name: 'No Significant Findings',
        probability: Math.round((100 - Math.random() * 15) * 100) / 100,
        color: '#10B981',
        description: 'No abnormalities detected above the confidence threshold across all 14 monitored conditions.',
        recommendations: ['Routine follow-up as clinically indicated'],
        boundingBox: {}
      }
    ];
  }

  const hasCritical = findings.some((f) => f.probability >= 70 && CRITICAL_NAMES.includes(f.name));
  const hasHigh = findings.some((f) => f.probability >= 70);
  const hasMedium = findings.some((f) => f.probability >= 40);

  let priority = 'low';
  if (hasCritical) priority = 'critical';
  else if (hasHigh) priority = 'high';
  else if (hasMedium) priority = 'medium';

  const summary =
    findings[0].name === 'No Significant Findings'
      ? 'No significant abnormalities detected across all 14 monitored conditions.'
      : `AI detected ${findings.length} finding(s) of note, led by ${findings[0].name} (${findings[0].probability}%).`;

  return { findings, priority, summary };
}

module.exports = { mockAnalysis, DISEASES };
