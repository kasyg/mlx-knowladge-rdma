import type { RegionDef } from '../types.ts';

const PI = Math.PI;

export const regions: RegionDef[] = [
  {
    id: 'head',
    names: { la: 'Caput', cs: 'Hlava', en: 'Head' },
    description: { cs: 'Lebka, mozek, smyslové orgány, žvýkací svaly, slinné žlázy.', en: 'Skull, brain, sense organs, masticatory muscles, salivary glands.' },
    anchor: 'skull_center',
    view: { azimuth: -0.7, polar: 1.45 },
    boxKinds: ['bone'],
  },
  {
    id: 'mouth',
    names: { la: 'Cavum oris', cs: 'Dutina ústní (tlama)', en: 'Mouth' },
    description: { cs: 'Zuby, jazyk, dolní čelist a svaly otevírající a zavírající tlamu.', en: 'Teeth, tongue, mandible and the muscles opening and closing the mouth.' },
    anchor: { at: 'mouth', dx: 0.03 },
    view: { azimuth: -1.0, polar: 1.5 },
    boxKinds: ['bone', 'digestive'],
  },
  {
    id: 'neck',
    names: { la: 'Collum', cs: 'Krk', en: 'Neck' },
    description: { cs: 'Krční obratle, šíjový vaz, průdušnice, jícen, krkavice a hrdelní žíla.', en: 'Cervical vertebrae, nuchal ligament, trachea, oesophagus, carotid artery and jugular vein.' },
    anchor: 'neck_mid',
    view: { azimuth: 0.0, polar: 1.5 },
    boxKinds: ['bone', 'muscle'],
  },
  {
    id: 'thorax',
    names: { la: 'Thorax', cs: 'Hrudník', en: 'Thorax' },
    description: { cs: 'Žebra, hrudní kost, srdce, plíce, bránice, velké cévy.', en: 'Ribs, sternum, heart, lungs, diaphragm, great vessels.' },
    anchor: 'thorax_center',
    view: { azimuth: 0.25, polar: 1.45 },
    boxKinds: ['bone'],
  },
  {
    id: 'abdomen',
    names: { la: 'Abdomen', cs: 'Břicho', en: 'Abdomen' },
    description: { cs: 'Žaludek, střeva, játra, slezina, ledviny a břišní svaly.', en: 'Stomach, intestines, liver, spleen, kidneys and abdominal muscles.' },
    anchor: 'abdomen_center',
    view: { azimuth: 0.1, polar: 1.55 },
    boxKinds: ['digestive', 'muscle', 'urinary'],
  },
  {
    id: 'back',
    names: { la: 'Dorsum', cs: 'Hřbet a bedra', en: 'Back and loins' },
    description: { cs: 'Hrudní a bederní obratle, nejdelší sval hřbetu, nadtrnový vaz.', en: 'Thoracic and lumbar vertebrae, longissimus, supraspinous ligament.' },
    anchor: 'back_mid',
    view: { azimuth: 0.3, polar: 0.6 },
    boxKinds: ['bone'],
  },
  {
    id: 'pelvis',
    names: { la: 'Pelvis', cs: 'Pánev', en: 'Pelvis' },
    description: { cs: 'Kost pánevní, kost křížová, hýžďové svaly, močový měchýř, konečník.', en: 'Hip bone, sacrum, gluteal muscles, urinary bladder, rectum.' },
    anchor: { between: ['sacrum', 'pubis'], t: 0.5 },
    view: { azimuth: 1.0, polar: 1.3 },
    boxKinds: ['bone'],
  },
  {
    id: 'forelimb',
    names: { la: 'Membrum thoracicum', cs: 'Hrudní (přední) končetina', en: 'Forelimb' },
    description: { cs: 'Lopatka, pažní kost, předloktí, zápěstí, holeň, spěnka a kopyto/tlapa se svaly, šlachami a vazy.', en: 'Scapula, humerus, forearm, carpus, cannon, fetlock and hoof/paw with their muscles, tendons and ligaments.' },
    anchor: 'fl_{S}_radius_mid',
    sided: true,
    view: { azimuth: -0.35, polar: 1.5 },
    boxKinds: ['bone'],
    motion: 'forelimb',
  },
  {
    id: 'hindlimb',
    names: { la: 'Membrum pelvinum', cs: 'Pánevní (zadní) končetina', en: 'Hindlimb' },
    description: { cs: 'Stehenní kost, koleno, bérec, hlezno, nárt, spěnka a kopyto/tlapa se svaly, šlachami a vazy.', en: 'Femur, stifle, crus, hock, metatarsus, fetlock and hoof/paw with their muscles, tendons and ligaments.' },
    anchor: 'hl_{S}_tibia_mid',
    sided: true,
    view: { azimuth: 0.35, polar: 1.5 },
    boxKinds: ['bone'],
    motion: 'hindlimb',
  },
  {
    id: 'tail',
    names: { la: 'Cauda', cs: 'Ocas', en: 'Tail' },
    description: { cs: 'Ocasní obratle a ocasní svaly.', en: 'Caudal vertebrae and tail muscles.' },
    anchor: 'tail_quarter',
    view: { azimuth: 1.1, polar: 1.4 },
    boxKinds: ['bone'],
  },
];

export const REGION_RIGHT_AZIMUTH = (az: number) => PI - az;
