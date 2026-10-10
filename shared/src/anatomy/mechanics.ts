/**
 * Muscle mechanics: where every muscle attaches (origin / insertion sites on the
 * bones, as rig landmarks), how its line of action runs over the joints (via
 * points), which tendons belong to it, its innervation and blood supply, the
 * fibre architecture and the numbers the muscle model needs (tendon fraction,
 * relative strength). Shared by all species: bone candidates are tried in order
 * (`['os_ungulare_fl', 'phalanges_fl']` = horse coffin bone, digit of the others)
 * and ids missing in a species are skipped.
 *
 * Point offsets are in units of withers height (H), `lat` is lateral for the
 * instance side. Attachment points move with the limb segment of their base
 * landmark (see client/src/three/segments.ts).
 */
import type { PointRef, Text2 } from '../types.ts';

export interface AttachSite {
  /** candidate bone ids (first present in the species wins); empty = soft tissue (fascia, skin, lips) */
  bone: string[];
  at: PointRef;
  /** name of the head / part attaching here */
  head?: Text2;
}

export type FibreArchitecture = 'parallel' | 'fusiform' | 'pennate' | 'bipennate' | 'multipennate' | 'sheet' | 'circular' | 'tendinous';

export interface MuscleMech {
  origin: AttachSite[];
  insertion: AttachSite[];
  /** wrapping points of the main line of action, from origin to insertion */
  via?: PointRef[];
  /** own tendons, aponeuroses and check ligaments (structure ids) */
  tendons?: string[];
  nerve?: string[];
  artery?: string[];
  fibres?: FibreArchitecture;
  /** tendon share of the muscle-tendon unit at rest (0 = all muscle, 1 = all tendon) */
  tendonFraction?: number;
  /** relative maximal force (physiological cross-section), 1 = small … 10 = gluteus medius */
  pcsa?: number;
  /** part of the passive stay apparatus (carries load with almost no muscle activity) */
  stay?: boolean;
}

const lm = (at: string, dx = 0, dy = 0, lat = 0): PointRef => ({ at, dx, dy, lat });
const fl = (n: string, dx = 0, dy = 0, lat = 0): PointRef => lm(`fl_{S}_${n}`, dx, dy, lat);
const hl = (n: string, dx = 0, dy = 0, lat = 0): PointRef => lm(`hl_{S}_${n}`, dx, dy, lat);
const site = (bone: string | string[] | null, at: PointRef, head?: Text2): AttachSite => ({ bone: bone === null ? [] : Array.isArray(bone) ? bone : [bone], at, head });
const H = (cs: string, en: string): Text2 => ({ cs, en });

// bones that are split in the horse and fused / grouped in the other species
const P1F = ['os_compedale_fl', 'phalanges_fl'];
const P2F = ['os_coronale_fl', 'phalanges_fl'];
const P3F = ['os_ungulare_fl', 'phalanges_fl'];
const P1H = ['os_compedale_hl', 'phalanges_hl'];
const P2H = ['os_coronale_hl', 'phalanges_hl'];
const P3H = ['os_ungulare_hl', 'phalanges_hl'];
const ACC = ['os_carpi_accessorium', 'ossa_carpi'];
const MC2 = ['os_metacarpale_II', 'ossa_metacarpalia'];
const MC4 = ['os_metacarpale_IV', 'ossa_metacarpalia'];
const MC3 = ['ossa_metacarpalia'];
const MT3 = ['ossa_metatarsalia'];
const TARS = ['os_tarsale_III', 'os_tarsale_I_II', 'os_tarsi_centrale', 'ossa_tarsi'];

export const MECHANICS: Record<string, MuscleMech> = {
  // ================================================================== head
  m_masseter: { origin: [site('cranium', lm('skull_zygoma_{S}', 0, -0.018, -0.004))], insertion: [site('mandibula', lm('mandible_angle_{S}', -0.03, 0.0, 0.004))], nerve: ['n_trigeminus'], artery: ['a_transversa_faciei', 'a_facialis'], fibres: 'multipennate', tendonFraction: 0.15, pcsa: 6 },
  m_temporalis: { origin: [site('cranium', lm('skull_temporal_{S}'))], insertion: [site('mandibula', lm('skull_tmj_{S}', -0.026, 0.004, -0.006))], nerve: ['n_trigeminus'], artery: ['a_maxillaris'], fibres: 'pennate', tendonFraction: 0.15, pcsa: 3 },
  m_buccinator: { origin: [site('cranium', lm('cheek_{S}', 0, 0.02, -0.01)), site('mandibula', lm('mandible_body_{S}', 0, 0.01))], insertion: [site(null, lm('mouth_corner_{S}'))], nerve: ['n_facialis'], artery: ['a_facialis'], fibres: 'sheet', tendonFraction: 0.02, pcsa: 1 },
  m_orbicularis_oris: { origin: [site(null, lm('mouth_corner_{S}', 0.004))], insertion: [site(null, lm('nostril_{S}', 0.01, -0.03, -0.03))], nerve: ['n_facialis'], artery: ['a_facialis'], fibres: 'circular', tendonFraction: 0, pcsa: 1 },
  m_levator_labii_superioris: { origin: [site('cranium', lm('skull_face', 0.03, -0.01, 0.03))], insertion: [site(null, lm('nostril_{S}', 0.004, 0.012, -0.012))], nerve: ['n_facialis'], artery: ['a_facialis'], fibres: 'fusiform', tendonFraction: 0.45, pcsa: 1 },
  m_levator_nasolabialis: { origin: [site('cranium', lm('skull_forehead', -0.02, -0.01, 0.02))], insertion: [site(null, lm('nostril_{S}', 0.006, 0.006))], nerve: ['n_facialis'], artery: ['a_facialis'], fibres: 'sheet', tendonFraction: 0.05, pcsa: 1 },
  m_depressor_labii_inferioris: { origin: [site('mandibula', lm('mandible_body_{S}', 0.03, 0.01))], insertion: [site(null, lm('mandible_chin', 0.004, 0.01, 0.014))], nerve: ['n_facialis'], artery: ['a_facialis'], fibres: 'fusiform', tendonFraction: 0.3, pcsa: 1 },
  m_digastricus: { origin: [site('cranium', lm('skull_mastoid_{S}', 0.004, -0.03, -0.012))], insertion: [site('mandibula', lm('mandible_body_{S}', 0.03, -0.016, -0.01))], nerve: ['n_facialis', 'n_trigeminus'], artery: ['truncus_linguofacialis', 'a_carotis_externa'], fibres: 'fusiform', tendonFraction: 0.3, pcsa: 2 },
  m_zygomaticus: { origin: [site('cranium', lm('skull_zygoma_{S}', -0.03, -0.022))], insertion: [site(null, lm('mouth_corner_{S}'))], nerve: ['n_facialis'], artery: ['a_facialis'], fibres: 'parallel', tendonFraction: 0.05, pcsa: 1 },
  m_pterygoideus_medialis: { origin: [site('cranium', lm('skull_base', -0.05, -0.01, 0.025))], insertion: [site('mandibula', lm('mandible_angle_{S}', -0.01, 0.0, -0.014))], nerve: ['n_trigeminus'], artery: ['a_maxillaris'], fibres: 'multipennate', tendonFraction: 0.15, pcsa: 3 },
  m_mylohyoideus: { origin: [site('mandibula', lm('mandible_body_{S}', 0, -0.012, -0.018))], insertion: [site('os_hyoideum', lm('hyoid', -0.02))], nerve: ['n_trigeminus'], artery: ['truncus_linguofacialis'], fibres: 'sheet', tendonFraction: 0.05, pcsa: 1 },
  m_geniohyoideus: { origin: [site('mandibula', lm('mandible_chin', 0.02, 0.0, 0.006))], insertion: [site('os_hyoideum', lm('hyoid', 0, 0, 0.006))], nerve: ['n_hypoglossus'], artery: ['truncus_linguofacialis'], fibres: 'fusiform', tendonFraction: 0.1, pcsa: 1 },

  // ================================================================== neck
  m_brachiocephalicus: {
    origin: [site('cranium', lm('skull_mastoid_{S}'), H('pars mastoidea', 'mastoid part')), site(['atlas', 'vertebrae_cervicales'], lm('c2', 0, 0, 0.05), H('pars cervicalis', 'cervical part'))],
    insertion: [site('humerus', fl('deltoid_tuberosity', -0.012, -0.01))],
    via: [fl('greater_tubercle', -0.026, 0.004, 0.006)],
    nerve: ['n_accessorius'], artery: ['a_cervicalis_superficialis', 'a_carotis_communis'], fibres: 'parallel', tendonFraction: 0.08, pcsa: 6,
  },
  m_sternocephalicus: { origin: [site('sternum', lm('sternum_cranial', 0, 0.01, 0.012))], insertion: [site(['mandibula', 'cranium'], lm('mandible_angle_{S}', 0.004, -0.02))], nerve: ['n_accessorius'], artery: ['a_carotis_communis'], fibres: 'parallel', tendonFraction: 0.12, pcsa: 3 },
  m_splenius: { origin: [site('vertebrae_thoracicae', lm('t3_tip', 0, -0.02, 0.01))], insertion: [site('cranium', lm('skull_occiput', 0.004, -0.004, 0.03)), site('atlas', lm('c1', 0.01, 0, 0.05))], nerve: [], artery: ['truncus_costocervicalis', 'a_vertebralis'], fibres: 'parallel', tendonFraction: 0.1, pcsa: 5 },
  m_semispinalis_capitis: { origin: [site('vertebrae_thoracicae', lm('t2', 0, 0.04, 0.03)), site('vertebrae_cervicales', lm('c5', 0, 0.02, 0.02))], insertion: [site('cranium', lm('skull_occiput', 0.004, -0.02, 0.014))], nerve: [], artery: ['a_vertebralis', 'a_occipitalis'], fibres: 'pennate', tendonFraction: 0.12, pcsa: 5 },
  m_longus_colli: { origin: [site('vertebrae_thoracicae', lm('t1', 0, -0.03, 0.01)), site('vertebrae_cervicales', lm('c6', 0, -0.03, 0.01))], insertion: [site('atlas', lm('c1', 0, -0.03, 0.006))], nerve: [], artery: ['a_vertebralis'], fibres: 'multipennate', tendonFraction: 0.15, pcsa: 2 },
  m_scalenus: { origin: [site('vertebrae_cervicales', lm('c6', 0, -0.01, 0.045))], insertion: [site('costae', { between: ['t1', 'sternum_cranial'], t: 0.45, lat: 0.07 })], nerve: [], artery: ['truncus_costocervicalis'], fibres: 'parallel', tendonFraction: 0.1, pcsa: 2 },
  m_omotransversarius: { origin: [site(['atlas', 'vertebrae_cervicales'], lm('c2', 0, -0.01, 0.06))], insertion: [site(['scapula', 'humerus'], fl('acromion', 0, -0.01))], nerve: ['n_accessorius'], artery: ['a_cervicalis_superficialis'], fibres: 'parallel', tendonFraction: 0.05, pcsa: 2 },
  m_trapezius: { origin: [site('vertebrae_thoracicae', lm('withers_tip', 0.02, -0.02, 0.006), H('pars thoracica', 'thoracic part')), site('vertebrae_cervicales', lm('c4', 0, 0.12, 0.006), H('pars cervicalis', 'cervical part'))], insertion: [site('scapula', fl('scapula_spine', 0.01, 0.02))], nerve: ['n_accessorius'], artery: ['a_cervicalis_superficialis'], fibres: 'sheet', tendonFraction: 0.1, pcsa: 2 },
  m_rhomboideus: { origin: [site('vertebrae_thoracicae', lm('withers_tip', -0.03, -0.01, 0.006)), site('vertebrae_cervicales', lm('c3', 0, 0.12, 0.006))], insertion: [site(['cartilago_scapulae', 'scapula'], fl('scapula_top', 0, 0.01, -0.006))], nerve: ['plexus_brachialis'], artery: ['truncus_costocervicalis'], fibres: 'parallel', tendonFraction: 0.05, pcsa: 3 },
  m_serratus_ventralis: {
    origin: [site('vertebrae_cervicales', lm('c5', 0, -0.01, 0.04), H('pars cervicalis', 'cervical part')), site('costae', lm('chest_wall_{S}', 0.02, 0.03, -0.01), H('pars thoracica', 'thoracic part'))],
    insertion: [site('scapula', fl('scapula_top', 0.01, -0.05, -0.022))],
    nerve: ['plexus_brachialis'], artery: ['a_cervicalis_superficialis', 'aa_intercostales_dorsales'], fibres: 'sheet', tendonFraction: 0.15, pcsa: 8, stay: true,
  },
  m_sternohyoideus: { origin: [site('sternum', lm('sternum_cranial', 0.004, 0.012))], insertion: [site('os_hyoideum', lm('hyoid', 0.004, -0.01))], nerve: [], artery: ['a_carotis_communis'], fibres: 'parallel', tendonFraction: 0.1, pcsa: 1 },
  m_omohyoideus: { origin: [site(null, fl('subscapular_fossa', -0.03, -0.12))], insertion: [site('os_hyoideum', lm('hyoid', 0.006, 0, 0.012))], nerve: [], artery: ['a_carotis_communis'], fibres: 'parallel', tendonFraction: 0.08, pcsa: 1 },
  m_longus_capitis: { origin: [site('vertebrae_cervicales', lm('c4', 0, -0.025, 0.02))], insertion: [site('cranium', lm('skull_base', 0.0, -0.02, 0.008))], nerve: [], artery: ['a_vertebralis'], fibres: 'fusiform', tendonFraction: 0.2, pcsa: 2 },
  m_obliquus_capitis_caudalis: { origin: [site('axis', lm('c2', 0, 0.04, 0.012))], insertion: [site('atlas', lm('c1', 0.01, 0.0, 0.06))], nerve: [], artery: ['a_occipitalis'], fibres: 'parallel', tendonFraction: 0.08, pcsa: 2 },

  // ================================================================== trunk
  m_latissimus_dorsi: {
    origin: [site(['vertebrae_thoracicae', 'vertebrae_lumbales'], lm('thoracic_mid_tip', 0.04, -0.05, 0.01))],
    insertion: [site('humerus', fl('teres_tuberosity', 0.004, 0.004, 0.004))],
    via: [fl('scapula_caudal', 0.03, -0.12, -0.03)],
    nerve: ['plexus_brachialis'], artery: ['a_subclavia_axillaris'], fibres: 'sheet', tendonFraction: 0.18, pcsa: 4,
  },
  m_pectoralis_superficialis: { origin: [site('sternum', lm('sternum_cranial', 0.04, 0.0, 0.012))], insertion: [site('humerus', fl('deltoid_tuberosity', 0.0, -0.02, -0.02))], nerve: ['plexus_brachialis'], artery: ['a_subclavia_axillaris', 'a_thoracica_interna'], fibres: 'parallel', tendonFraction: 0.1, pcsa: 4 },
  m_pectoralis_profundus: { origin: [site('sternum', lm('sternum_mid', 0, 0.0, 0.016)), site('cartilagines_costales', lm('sternum_mid', 0.08, 0.03, 0.06))], insertion: [site('humerus', fl('lesser_tubercle', 0, -0.006)), site('humerus', fl('greater_tubercle', 0.004, -0.006))], nerve: ['plexus_brachialis'], artery: ['a_subclavia_axillaris', 'a_thoracica_interna'], fibres: 'parallel', tendonFraction: 0.1, pcsa: 6 },
  m_longissimus_dorsi: { origin: [site(['os_coxae', 'os_sacrum'], lm('sacrum', -0.04, 0.02, 0.045)), site('vertebrae_lumbales', lm('lumbar_mid', 0, 0.03, 0.03))], insertion: [site('vertebrae_thoracicae', lm('t3', 0, 0.03, 0.04)), site('costae', lm('thoracic_mid', 0, -0.03, 0.08)), site('vertebrae_cervicales', lm('c7', 0, 0.02, 0.03))], nerve: [], artery: ['aa_intercostales_dorsales'], fibres: 'multipennate', tendonFraction: 0.2, pcsa: 9 },
  m_iliocostalis: { origin: [site(['os_coxae', 'vertebrae_lumbales'], lm('lumbar_mid', 0, -0.01, 0.08))], insertion: [site('costae', lm('thoracic_mid', -0.1, -0.06, 0.12))], nerve: [], artery: ['aa_intercostales_dorsales'], fibres: 'pennate', tendonFraction: 0.25, pcsa: 3 },
  m_spinalis: { origin: [site('vertebrae_lumbales', lm('lumbar_mid_tip', 0, -0.01, 0.006))], insertion: [site('vertebrae_thoracicae', lm('withers_tip', 0.02, -0.04, 0.006)), site('vertebrae_cervicales', lm('c7', 0, 0.04, 0.012))], nerve: [], artery: ['aa_intercostales_dorsales'], fibres: 'pennate', tendonFraction: 0.2, pcsa: 4 },
  mm_intercostales: { origin: [site('costae', lm('chest_wall_{S}', -0.012, 0.02, -0.006))], insertion: [site('costae', lm('chest_wall_{S}', 0.016, 0.0, -0.006))], nerve: ['nn_intercostales'], artery: ['aa_intercostales_dorsales'], fibres: 'parallel', tendonFraction: 0.05, pcsa: 2 },
  m_obliquus_externus_abdominis: { origin: [site('costae', lm('chest_wall_{S}', 0.18, 0.04, -0.01))], insertion: [site(['os_coxae'], lm('pubis', -0.02, 0.0, 0.05)), site(null, lm('linea_alba', 0, 0, 0.01))], nerve: ['nn_intercostales'], artery: ['a_circumflexa_ilium_profunda', 'aa_intercostales_dorsales'], fibres: 'sheet', tendonFraction: 0.45, pcsa: 4 },
  m_obliquus_internus_abdominis: { origin: [site('os_coxae', hl('tuber_coxae', 0.0, -0.02, -0.01))], insertion: [site('costae', lm('t_last', -0.03, -0.22, 0.16)), site(null, lm('linea_alba', 0.04, 0, 0.01))], nerve: ['nn_intercostales'], artery: ['a_circumflexa_ilium_profunda'], fibres: 'sheet', tendonFraction: 0.4, pcsa: 3 },
  m_rectus_abdominis: { origin: [site(['sternum', 'cartilagines_costales'], lm('sternum_mid', 0.02, 0.0, 0.03))], insertion: [site('os_coxae', lm('pubis', 0, 0.0, 0.02))], nerve: ['nn_intercostales'], artery: ['a_thoracica_interna'], fibres: 'parallel', tendonFraction: 0.15, pcsa: 4 },
  m_transversus_abdominis: { origin: [site(['vertebrae_lumbales', 'cartilagines_costales'], lm('lumbar_mid', 0, -0.04, 0.08))], insertion: [site(null, lm('linea_alba', 0, 0, 0.01))], nerve: ['nn_intercostales'], artery: ['a_circumflexa_ilium_profunda'], fibres: 'sheet', tendonFraction: 0.35, pcsa: 2 },
  diaphragma: { origin: [site('vertebrae_lumbales', lm('lumbar_q1', 0, -0.05), H('crura', 'crura')), site('costae', lm('diaphragm_dorsal', -0.02, -0.08, 0.16), H('pars costalis', 'costal part')), site('sternum', lm('xiphoid', -0.02, 0.01), H('pars sternalis', 'sternal part'))], insertion: [site(null, lm('diaphragm_center'), H('centrum tendineum', 'central tendon'))], nerve: ['n_phrenicus'], artery: ['aorta'], fibres: 'sheet', tendonFraction: 0.3, pcsa: 6 },
  m_serratus_dorsalis: { origin: [site('vertebrae_thoracicae', lm('thoracic_mid_tip', 0, -0.03, 0.01))], insertion: [site('costae', lm('thoracic_mid', 0.0, -0.08, 0.13))], nerve: ['nn_intercostales'], artery: ['aa_intercostales_dorsales'], fibres: 'sheet', tendonFraction: 0.5, pcsa: 1 },
  m_multifidus: { origin: [site(['vertebrae_lumbales', 'os_sacrum'], lm('lumbar_mid', 0, 0.02, 0.02))], insertion: [site('vertebrae_thoracicae', lm('thoracic_mid', 0, 0.06, 0.012))], nerve: [], artery: ['aa_intercostales_dorsales'], fibres: 'multipennate', tendonFraction: 0.2, pcsa: 3 },
  m_psoas_minor: { origin: [site(['vertebrae_lumbales', 'vertebrae_thoracicae'], lm('lumbar_q1', 0, -0.045, 0.02))], insertion: [site('os_coxae', lm('pelvic_inlet', 0, 0, 0.07))], nerve: ['plexus_lumbosacralis'], artery: ['aorta'], fibres: 'fusiform', tendonFraction: 0.35, pcsa: 2 },
  m_quadratus_lumborum: { origin: [site(['vertebrae_lumbales', 'costae'], lm('lumbar_q1', 0, -0.02, 0.06))], insertion: [site('os_sacrum', lm('sacrum', -0.03, -0.02, 0.05))], nerve: ['plexus_lumbosacralis'], artery: ['aorta'], fibres: 'pennate', tendonFraction: 0.15, pcsa: 2 },

  // ================================================================== forelimb
  m_supraspinatus: {
    origin: [site('scapula', fl('scapula_fossa_cranial'))],
    insertion: [site('humerus', fl('greater_tubercle', -0.004, 0.004), H('tuberculum majus', 'greater tubercle')), site('humerus', fl('lesser_tubercle', -0.004, 0.004), H('tuberculum minus', 'lesser tubercle'))],
    via: [fl('supraglenoid', -0.012, 0.0, 0.004)],
    nerve: ['n_suprascapularis'], artery: ['a_subclavia_axillaris'], fibres: 'pennate', tendonFraction: 0.2, pcsa: 5,
  },
  m_infraspinatus: { origin: [site('scapula', fl('scapula_fossa_caudal'))], insertion: [site('humerus', fl('greater_tubercle', 0.04, -0.03, 0.006))], nerve: ['n_suprascapularis'], artery: ['a_subclavia_axillaris'], fibres: 'multipennate', tendonFraction: 0.3, pcsa: 5 },
  m_deltoideus: { origin: [site('scapula', fl('scapula_spine', 0.02, 0.0, -0.004), H('pars scapularis', 'scapular part')), site('scapula', fl('scapula_caudal', -0.03, -0.12), H('margo caudalis', 'caudal border'))], insertion: [site('humerus', fl('deltoid_tuberosity', 0.004, 0.0, 0.002))], nerve: ['n_axillaris'], artery: ['a_subclavia_axillaris'], fibres: 'multipennate', tendonFraction: 0.12, pcsa: 4 },
  m_teres_major: { origin: [site('scapula', fl('scapula_caudal', 0.0, -0.02, -0.02))], insertion: [site('humerus', fl('teres_tuberosity'))], nerve: ['n_axillaris'], artery: ['a_subclavia_axillaris'], fibres: 'parallel', tendonFraction: 0.1, pcsa: 3 },
  m_teres_minor: { origin: [site('scapula', { between: ['fl_{S}_scapula_caudal', 'fl_{S}_shoulder'], t: 0.62, dx: 0.02 })], insertion: [site('humerus', fl('deltoid_tuberosity', 0.016, 0.034, -0.006))], nerve: ['n_axillaris'], artery: ['a_subclavia_axillaris'], fibres: 'parallel', tendonFraction: 0.15, pcsa: 1 },
  m_subscapularis: { origin: [site('scapula', fl('subscapular_fossa'))], insertion: [site('humerus', fl('lesser_tubercle', 0.008, 0.0))], nerve: ['plexus_brachialis'], artery: ['a_subclavia_axillaris'], fibres: 'multipennate', tendonFraction: 0.25, pcsa: 5 },
  m_coracobrachialis: { origin: [site('scapula', fl('coracoid'))], insertion: [site('humerus', fl('teres_tuberosity', -0.004, -0.012, -0.002))], via: [fl('lesser_tubercle', 0.03, -0.02, -0.004)], nerve: ['n_musculocutaneus'], artery: ['a_brachialis'], fibres: 'fusiform', tendonFraction: 0.3, pcsa: 1 },
  m_biceps_brachii: {
    origin: [site('scapula', fl('supraglenoid'))],
    insertion: [site('radius', fl('radial_tuberosity'))],
    via: [fl('greater_tubercle', -0.01, 0.0, -0.014), fl('humerus_mid', -0.036), fl('elbow_cranial', -0.012, 0.012, -0.004)],
    tendons: ['lacertus_fibrosus'], nerve: ['n_musculocutaneus'], artery: ['a_brachialis'], fibres: 'pennate', tendonFraction: 0.45, pcsa: 5, stay: true,
  },
  m_brachialis: { origin: [site('humerus', fl('humerus_caudal', 0.0, 0.07))], insertion: [site(['radius', 'ulna'], fl('radial_tuberosity', 0.006, -0.012, 0.004))], via: [fl('humerus_mid', 0.0, -0.02, 0.022), fl('elbow_cranial', -0.006, 0.014, 0.006)], nerve: ['n_musculocutaneus', 'n_radialis'], artery: ['a_brachialis'], fibres: 'parallel', tendonFraction: 0.1, pcsa: 3 },
  m_triceps_brachii: {
    origin: [site('scapula', { between: ['fl_{S}_scapula_caudal', 'fl_{S}_shoulder'], t: 0.5, dx: 0.01 }, H('caput longum', 'long head')), site('humerus', fl('deltoid_tuberosity', 0.04, 0.03), H('caput laterale', 'lateral head')), site('humerus', fl('humerus_medial', 0.03, 0.0), H('caput mediale', 'medial head'))],
    insertion: [site('ulna', fl('olecranon', 0.004, 0.012))],
    via: [fl('humerus_caudal', 0.03, -0.04)],
    nerve: ['n_radialis'], artery: ['a_brachialis', 'a_collateralis_ulnaris'], fibres: 'multipennate', tendonFraction: 0.12, pcsa: 9,
  },
  m_anconeus: { origin: [site('humerus', fl('humerus_caudal', 0.006, -0.07))], insertion: [site('ulna', fl('olecranon', -0.01, -0.01, 0.008))], nerve: ['n_radialis'], artery: ['a_collateralis_ulnaris'], fibres: 'parallel', tendonFraction: 0.05, pcsa: 1 },
  m_tensor_fasciae_antebrachii: { origin: [site('scapula', fl('scapula_caudal', -0.03, -0.12, -0.02))], insertion: [site('ulna', fl('olecranon', 0.006, 0.0, -0.012))], via: [fl('humerus_caudal', 0.05, -0.02, -0.01)], nerve: ['n_radialis'], artery: ['a_collateralis_ulnaris'], fibres: 'sheet', tendonFraction: 0.2, pcsa: 1 },
  m_extensor_carpi_radialis: {
    origin: [site('humerus', fl('lateral_epicondyle', -0.022, 0.024))],
    insertion: [site(MC3, fl('mc3_tuberosity'))],
    via: [fl('elbow_cranial', -0.008, 0.0, 0.01), fl('radius_dist', -0.024)],
    tendons: ['tendo_ext_carpi_radialis', 'lacertus_fibrosus'], nerve: ['n_radialis'], artery: ['a_mediana', 'a_collateralis_ulnaris'], fibres: 'pennate', tendonFraction: 0.45, pcsa: 4, stay: true,
  },
  m_extensor_digitorum_communis: {
    origin: [site('humerus', fl('lateral_epicondyle', -0.012, 0.004))],
    insertion: [site(P3F, fl('extensor_process'))],
    via: [fl('radius_dist', -0.02, 0.0, 0.008), fl('cannon_prox', -0.022), fl('cannon_dist', -0.02), fl('p1_dorsal', -0.002)],
    tendons: ['tendo_ext_dig_communis'], nerve: ['n_radialis'], artery: ['a_mediana'], fibres: 'pennate', tendonFraction: 0.68, pcsa: 3,
  },
  m_extensor_digitorum_lateralis: {
    origin: [site(['radius', 'ulna'], fl('radius_lateral', 0.0, 0.05))],
    insertion: [site(P1F, fl('p1_dorsal', 0.0, 0.0, 0.006))],
    via: [fl('radius_dist', -0.012, 0.0, 0.02), fl('cannon_prox', -0.018, 0.0, 0.008), fl('cannon_dist', -0.02, 0.0, 0.004)],
    tendons: ['tendo_ext_dig_lateralis_fl'], nerve: ['n_radialis'], artery: ['a_mediana'], fibres: 'pennate', tendonFraction: 0.65, pcsa: 1,
  },
  m_extensor_carpi_ulnaris: {
    origin: [site('humerus', fl('lateral_epicondyle', 0.012, 0.0))],
    insertion: [site(ACC, fl('accessory_carpal', 0.0, 0.004, 0.012)), site(MC4, fl('mc4_head'))],
    via: [fl('radius_caudal', 0.008, 0.0, 0.02), fl('radius_dist', 0.026, 0.0, 0.016)],
    nerve: ['n_radialis'], artery: ['a_collateralis_ulnaris'], fibres: 'pennate', tendonFraction: 0.35, pcsa: 3,
  },
  m_abductor_digiti_I_longus: { origin: [site('radius', fl('radius_lateral', -0.006, -0.03))], insertion: [site(MC2, fl('mc2_head', -0.01))], via: [fl('radius_dist', -0.022, 0.0, -0.014)], nerve: ['n_radialis'], artery: ['a_mediana'], fibres: 'pennate', tendonFraction: 0.45, pcsa: 1 },
  m_flexor_carpi_radialis: { origin: [site('humerus', fl('medial_epicondyle'))], insertion: [site(MC2, fl('mc2_head'))], via: [fl('radius_dist', 0.018, 0.0, -0.014)], nerve: ['n_medianus_ulnaris'], artery: ['a_mediana'], fibres: 'pennate', tendonFraction: 0.4, pcsa: 2 },
  m_flexor_carpi_ulnaris: { origin: [site('humerus', fl('medial_epicondyle', 0.012, 0.0), H('caput humerale', 'humeral head')), site('ulna', fl('olecranon', 0.0, -0.01, -0.01), H('caput ulnare', 'ulnar head'))], insertion: [site(ACC, fl('accessory_carpal'))], via: [fl('radius_dist', 0.03, 0.0, -0.006)], nerve: ['n_ulnaris'], artery: ['a_collateralis_ulnaris'], fibres: 'pennate', tendonFraction: 0.3, pcsa: 3 },
  m_flexor_digitorum_superficialis_fl: {
    origin: [site('humerus', fl('medial_epicondyle', 0.014, -0.004))],
    insertion: [site(P2F, fl('p2_palmar')), site(P1F, fl('pastern', 0.018, 0.012))],
    via: [fl('radius_dist', 0.03), fl('accessory_carpal', -0.004, -0.01, -0.004), fl('cannon_dist', 0.026), fl('sesamoid', 0.012, 0.0)],
    tendons: ['tendo_fds_fl', 'lig_accessorium_sdft', 'lig_anulare_palmare', 'ligg_anularia_digiti'], nerve: ['n_ulnaris'], artery: ['a_mediana'], fibres: 'pennate', tendonFraction: 0.75, pcsa: 4, stay: true,
  },
  m_flexor_digitorum_profundus_fl: {
    origin: [site('humerus', fl('medial_epicondyle', 0.008, -0.008), H('caput humerale', 'humeral head')), site('ulna', fl('olecranon', -0.004, -0.04, -0.006), H('caput ulnare', 'ulnar head')), site('radius', fl('radius_caudal'), H('caput radiale', 'radial head'))],
    insertion: [site(P3F, fl('p3_flexor'))],
    via: [fl('radius_dist', 0.026, 0.0, -0.002), fl('accessory_carpal', -0.008, -0.012, -0.002), fl('cannon_dist', 0.02), fl('sesamoid', 0.006, -0.004), fl('p2_palmar', -0.006, 0.0)],
    tendons: ['tendo_fdp_fl', 'lig_accessorium', 'lig_anulare_palmare', 'ligg_anularia_digiti'], nerve: ['n_medianus_ulnaris', 'n_ulnaris'], artery: ['a_mediana'], fibres: 'multipennate', tendonFraction: 0.72, pcsa: 6, stay: true,
  },
  mm_interossei: { origin: [site(MC3, fl('cannon_prox', 0.014))], insertion: [site(['ossa_sesamoidea_proximalia_fl'], fl('sesamoid', 0.004, 0.006))], nerve: ['nn_palmares'], artery: ['aa_digitales_palmares'], fibres: 'tendinous', tendonFraction: 0.6, pcsa: 2, stay: true },

  // ================================================================== hindlimb
  m_gluteus_superficialis: { origin: [site('os_coxae', hl('tuber_coxae', 0.01, -0.02))], insertion: [site('femur', hl('third_trochanter'))], nerve: ['nn_glutei'], artery: ['a_glutea_cranialis'], fibres: 'parallel', tendonFraction: 0.15, pcsa: 3 },
  m_gluteus_medius: {
    origin: [site('os_coxae', hl('iliac_wing', -0.05, 0.0), H('facies glutea ilia', 'gluteal surface of the ilium')), site(['os_sacrum', 'vertebrae_lumbales'], lm('lumbar_mid', 0.02, 0.06, 0.05), H('aponeuróza m. longissimus', 'longissimus aponeurosis'))],
    insertion: [site('femur', hl('trochanter', 0.01, 0.012))],
    nerve: ['nn_glutei'], artery: ['a_glutea_cranialis', 'a_glutea_caudalis'], fibres: 'multipennate', tendonFraction: 0.1, pcsa: 10,
  },
  m_gluteus_accessorius: { origin: [site('os_coxae', hl('iliac_wing', -0.03, -0.03, -0.01))], insertion: [site('femur', hl('trochanter', -0.006, -0.03, -0.004))], via: [hl('trochanter', -0.012, 0.012, 0.004)], nerve: ['nn_glutei'], artery: ['a_glutea_cranialis'], fibres: 'pennate', tendonFraction: 0.25, pcsa: 2 },
  m_gluteus_profundus: { origin: [site('os_coxae', hl('ischiatic_notch', -0.01, -0.04))], insertion: [site('femur', hl('trochanter', -0.02, -0.01))], nerve: ['nn_glutei'], artery: ['a_glutea_cranialis'], fibres: 'parallel', tendonFraction: 0.1, pcsa: 2 },
  m_tensor_fasciae_latae: { origin: [site('os_coxae', hl('tuber_coxae', 0.0, -0.03))], insertion: [site(['tibia', 'patella'], hl('tibial_crest', 0.0, 0.0, 0.016))], via: [hl('femur_cranial', -0.03, 0.0, 0.02), hl('patella', -0.012, 0.0, 0.012)], nerve: ['nn_glutei'], artery: ['a_circumflexa_ilium_profunda', 'a_femoralis_profunda'], fibres: 'parallel', tendonFraction: 0.5, pcsa: 2 },
  m_rectus_femoris: { origin: [site('os_coxae', hl('ilium_body'))], insertion: [site('tibia', hl('tibial_tuberosity'))], via: [hl('femur_cranial', -0.034), hl('patella', -0.01)], tendons: ['lig_patellae_intermedium'], nerve: ['n_femoralis'], artery: ['a_femoralis'], fibres: 'bipennate', tendonFraction: 0.2, pcsa: 5 },
  m_vastus_lateralis: { origin: [site('femur', hl('femur_cranial', 0.02, 0.08, 0.022))], insertion: [site('tibia', hl('tibial_tuberosity', 0.0, 0.0, 0.006))], via: [hl('patella', -0.008, 0.0, 0.008)], tendons: ['lig_patellae_laterale', 'lig_patellae_intermedium'], nerve: ['n_femoralis'], artery: ['a_femoralis'], fibres: 'pennate', tendonFraction: 0.12, pcsa: 5 },
  m_vastus_medialis: { origin: [site('femur', hl('femur_cranial', 0.02, 0.08, -0.022))], insertion: [site('tibia', hl('tibial_tuberosity', 0.0, 0.0, -0.006))], via: [hl('patella', -0.008, 0.0, -0.008)], tendons: ['lig_patellae_mediale', 'lig_patellae_intermedium'], nerve: ['n_femoralis'], artery: ['a_femoralis'], fibres: 'pennate', tendonFraction: 0.12, pcsa: 4 },
  m_vastus_intermedius: { origin: [site('femur', hl('femur_cranial', 0.006, 0.06))], insertion: [site('tibia', hl('tibial_tuberosity'))], via: [hl('patella', -0.004)], tendons: ['lig_patellae_intermedium'], nerve: ['n_femoralis'], artery: ['a_femoralis'], fibres: 'parallel', tendonFraction: 0.1, pcsa: 2 },
  m_quadriceps_femoris: { origin: [site('os_coxae', hl('ilium_body')), site('femur', hl('femur_cranial', 0.01, 0.07))], insertion: [site('tibia', hl('tibial_tuberosity'))], via: [hl('femur_cranial', -0.034), hl('patella', -0.01)], tendons: ['lig_patellae_intermedium', 'lig_patellae_mediale', 'lig_patellae_laterale'], nerve: ['n_femoralis'], artery: ['a_femoralis'], fibres: 'bipennate', tendonFraction: 0.15, pcsa: 8 },
  m_biceps_femoris: {
    origin: [site(['os_sacrum', 'vertebrae_caudales'], lm('sacrum_end', -0.04, 0.0, 0.07), H('caput vertebrale', 'vertebral head')), site('os_coxae', hl('tuber_ischii', 0.004, -0.012), H('caput pelvinum', 'pelvic head'))],
    insertion: [site(['tibia', 'patella'], hl('tibial_crest', 0.012, 0.03, 0.026)), site('calcaneus', hl('calcaneus', 0.006, 0.02, 0.006))],
    via: [hl('femur_caudal', 0.07, 0.04, 0.03), hl('supracondylar', 0.05, 0.0, 0.03)],
    tendons: ['tendo_calcaneus_communis'], nerve: ['n_ischiadicus', 'nn_glutei'], artery: ['a_glutea_caudalis', 'a_femoralis_profunda'], fibres: 'parallel', tendonFraction: 0.12, pcsa: 9,
  },
  m_semitendinosus: {
    origin: [site(['os_coxae'], hl('tuber_ischii', 0.006, -0.03)), site(['vertebrae_caudales', 'os_sacrum'], lm('tail_2', 0.0, -0.02, 0.03))],
    insertion: [site('tibia', hl('tibia_medial', -0.008, -0.02)), site('calcaneus', hl('calcaneus', 0.004, 0.016, -0.006))],
    via: [hl('femur_caudal', 0.07, 0.0, 0.0), hl('supracondylar', 0.05, -0.02)],
    tendons: ['tendo_calcaneus_communis'], nerve: ['n_ischiadicus'], artery: ['a_glutea_caudalis', 'a_femoralis_profunda'], fibres: 'parallel', tendonFraction: 0.12, pcsa: 5,
  },
  m_semimembranosus: { origin: [site('os_coxae', hl('tuber_ischii', -0.01, -0.05, -0.02))], insertion: [site('femur', hl('femur_medial_condyle', 0.006, 0.0)), site('tibia', hl('tibia_medial', 0.006, 0.03))], via: [hl('femur_caudal', 0.05, -0.04, -0.03)], nerve: ['n_ischiadicus'], artery: ['a_femoralis_profunda'], fibres: 'parallel', tendonFraction: 0.1, pcsa: 6 },
  m_sartorius: { origin: [site('os_coxae', hl('ilium_body', -0.03, -0.01, -0.03))], insertion: [site('tibia', hl('tibia_medial', -0.012))], via: [hl('femur_cranial', -0.01, -0.02, -0.04)], nerve: ['n_saphenus', 'n_femoralis'], artery: ['a_femoralis'], fibres: 'parallel', tendonFraction: 0.1, pcsa: 1 },
  m_gracilis: { origin: [site('os_coxae', lm('pubis', 0.05, 0.0, 0.012))], insertion: [site('tibia', hl('tibia_medial', 0.004, 0.0, -0.004))], nerve: ['n_obturatorius'], artery: ['a_femoralis_profunda'], fibres: 'parallel', tendonFraction: 0.18, pcsa: 2 },
  m_pectineus: { origin: [site('os_coxae', hl('hip', -0.04, -0.06, -0.05))], insertion: [site('femur', hl('femur_mid', 0.0, 0.0, -0.026))], nerve: ['n_obturatorius', 'n_femoralis'], artery: ['a_femoralis_profunda'], fibres: 'fusiform', tendonFraction: 0.12, pcsa: 2 },
  m_adductor: { origin: [site('os_coxae', lm('pubis', 0.08, 0.0, 0.03))], insertion: [site('femur', hl('femur_caudal', 0.0, -0.04, -0.016))], nerve: ['n_obturatorius'], artery: ['a_femoralis_profunda', 'a_obturatoria'], fibres: 'parallel', tendonFraction: 0.08, pcsa: 6 },
  m_iliopsoas: { origin: [site(['vertebrae_lumbales', 'os_coxae'], lm('lumbar_mid', 0.0, -0.05, 0.03))], insertion: [site('femur', hl('lesser_trochanter'))], via: [lm('pelvic_inlet', -0.02, 0.01, 0.09), hl('ilium_body', -0.01, -0.06, -0.01)], nerve: ['n_femoralis', 'plexus_lumbosacralis'], artery: ['a_iliaca_externa', 'a_circumflexa_ilium_profunda'], fibres: 'fusiform', tendonFraction: 0.15, pcsa: 6 },
  m_obturatorius_internus: { origin: [site('os_coxae', lm('pubis', 0.05, 0.04, 0.06))], insertion: [site('femur', hl('trochanter', 0.02, -0.02, -0.02))], via: [hl('ischiatic_notch', 0.02, -0.08, -0.02)], nerve: ['n_ischiadicus'], artery: ['a_obturatoria'], fibres: 'pennate', tendonFraction: 0.3, pcsa: 1 },
  m_obturatorius_externus: { origin: [site('os_coxae', lm('pubis', 0.05, -0.01, 0.06))], insertion: [site('femur', hl('trochanter', 0.02, -0.04, -0.02))], nerve: ['n_obturatorius'], artery: ['a_obturatoria'], fibres: 'pennate', tendonFraction: 0.2, pcsa: 1 },
  m_gastrocnemius: {
    origin: [site('femur', hl('supracondylar', 0.004, 0.0, 0.016), H('caput laterale', 'lateral head')), site('femur', hl('supracondylar', 0.004, 0.0, -0.016), H('caput mediale', 'medial head'))],
    insertion: [site('calcaneus', hl('calcaneus', 0.004, 0.012))],
    via: [hl('tibia_caudal', 0.03, 0.0)],
    tendons: ['tendo_calcaneus_communis'], nerve: ['n_tibialis'], artery: ['a_poplitea_tibialis'], fibres: 'bipennate', tendonFraction: 0.45, pcsa: 6,
  },
  m_flexor_digitorum_superficialis_hl: {
    origin: [site('femur', hl('supracondylar', 0.0, -0.01))],
    insertion: [site('calcaneus', hl('calcaneus', 0.008, 0.022), H('úpon na patním hrbolu', 'calcanean attachment')), site(P2H, hl('p2_palmar'))],
    via: [hl('tibia_caudal', 0.024, -0.02), hl('calcaneus', 0.01, 0.024), hl('cannon_dist', 0.026), hl('sesamoid', 0.012, 0.0)],
    tendons: ['tendo_fds_hl', 'tendo_calcaneus_communis', 'lig_anulare_palmare', 'ligg_anularia_digiti'], nerve: ['n_tibialis'], artery: ['a_poplitea_tibialis'], fibres: 'tendinous', tendonFraction: 0.95, pcsa: 2, stay: true,
  },
  m_flexor_digitorum_profundus_hl: {
    origin: [site('tibia', hl('tibia_caudal'), H('caput laterale', 'lateral head')), site('fibula', hl('fibula_head', 0.006, -0.01), H('caput tibiale caudale', 'caudal tibial head'))],
    insertion: [site(P3H, hl('p3_flexor'))],
    via: [hl('tibia_dist', 0.026, 0.0, -0.012), hl('calcaneus', -0.04, -0.06, -0.014), hl('cannon_dist', 0.02), hl('sesamoid', 0.006, -0.004), hl('p2_palmar', -0.006)],
    tendons: ['tendo_fdp_hl', 'lig_accessorium_ddft_hl', 'lig_anulare_palmare', 'ligg_anularia_digiti'], nerve: ['n_tibialis'], artery: ['a_poplitea_tibialis'], fibres: 'multipennate', tendonFraction: 0.75, pcsa: 4, stay: true,
  },
  m_tibialis_caudalis: { origin: [site('tibia', hl('tibia_caudal', 0.0, 0.03, 0.01))], insertion: [site(['calcaneus', 'ossa_tarsi'], hl('calcaneus', -0.035, -0.055, -0.016))], via: [hl('tibia_dist', 0.026, 0.0, -0.01)], tendons: ['tendo_fdp_hl'], nerve: ['n_tibialis'], artery: ['a_poplitea_tibialis'], fibres: 'pennate', tendonFraction: 0.5, pcsa: 1 },
  m_tibialis_cranialis: {
    origin: [site('tibia', hl('tibial_crest', 0.006, 0.02, 0.016))],
    insertion: [site(MT3, hl('mt3_tuberosity', 0.0, 0.0, -0.004)), site(TARS, hl('tarsus_medial'))],
    via: [hl('tibia_dist', -0.022, 0.0, 0.004)],
    tendons: ['tendo_cuneanus'], nerve: ['n_fibularis'], artery: ['a_poplitea_tibialis', 'a_metatarsea_dorsalis_III'], fibres: 'pennate', tendonFraction: 0.4, pcsa: 3,
  },
  m_fibularis_tertius: {
    origin: [site('femur', hl('extensor_fossa'))],
    insertion: [site(['calcaneus', 'os_tarsale_IV', 'ossa_tarsi'], hl('calcaneus', -0.06, -0.07, 0.016)), site(MT3, hl('mt3_tuberosity', 0.0, 0.0, 0.006))],
    via: [hl('tibial_crest', -0.012, 0.0, 0.01), hl('tibia_dist', -0.026, 0.0, 0.006)],
    nerve: ['n_fibularis'], artery: ['a_poplitea_tibialis'], fibres: 'tendinous', tendonFraction: 1, pcsa: 4, stay: true,
  },
  m_extensor_digitorum_longus: {
    origin: [site('femur', hl('extensor_fossa', 0.0, 0.0, 0.004))],
    insertion: [site(P3H, hl('extensor_process'))],
    via: [hl('tibial_crest', -0.014, -0.02, 0.006), hl('tibia_dist', -0.028), hl('cannon_prox', -0.02), hl('cannon_dist', -0.02), hl('p1_dorsal', -0.002)],
    tendons: ['tendo_ext_dig_longus'], nerve: ['n_fibularis'], artery: ['a_poplitea_tibialis', 'a_metatarsea_dorsalis_III'], fibres: 'pennate', tendonFraction: 0.65, pcsa: 3,
  },
  m_extensor_digitorum_lateralis_hl: {
    origin: [site(['fibula', 'tibia'], hl('fibula_head', 0.0, -0.02))],
    insertion: [site(P3H, hl('extensor_process', 0.0, 0.0, 0.004))],
    via: [hl('tibia_dist', -0.004, 0.0, 0.024), hl('cannon_prox', -0.016, 0.0, 0.008), hl('cannon_mid', -0.02), hl('cannon_dist', -0.02), hl('p1_dorsal', -0.002)],
    tendons: ['tendo_ext_dig_lateralis_hl', 'tendo_ext_dig_longus'], nerve: ['n_fibularis'], artery: ['a_poplitea_tibialis'], fibres: 'pennate', tendonFraction: 0.7, pcsa: 1,
  },
  m_fibularis_longus: { origin: [site(['fibula', 'tibia'], hl('fibula_head'))], insertion: [site(['ossa_tarsi', 'ossa_metatarsalia'], hl('cannon_prox', 0.014, 0.0, -0.01))], via: [hl('tibia_dist', 0.006, 0.0, 0.024)], nerve: ['n_fibularis'], artery: ['a_poplitea_tibialis'], fibres: 'pennate', tendonFraction: 0.5, pcsa: 1 },
  m_popliteus: { origin: [site('femur', hl('extensor_fossa', 0.05, -0.006, 0.004))], insertion: [site('tibia', hl('tibia_caudal', 0.0, 0.02, -0.016))], nerve: ['n_tibialis'], artery: ['a_poplitea_tibialis'], fibres: 'parallel', tendonFraction: 0.15, pcsa: 1 },

  // ================================================================== tail and pelvic outlet
  m_coccygeus: { origin: [site('os_coxae', hl('ischiatic_notch', 0.02, -0.04, -0.03))], insertion: [site('vertebrae_caudales', lm('tail_2', 0, 0, 0.02))], nerve: ['n_pudendus'], artery: ['a_glutea_caudalis'], fibres: 'sheet', tendonFraction: 0.1, pcsa: 1 },
  mm_caudae: { origin: [site(['os_sacrum', 'vertebrae_lumbales'], lm('sacrum', 0, 0.04, 0.01))], insertion: [site('vertebrae_caudales', lm('tail_mid', 0, 0.02, 0.006))], nerve: [], artery: ['a_sacralis_mediana'], fibres: 'pennate', tendonFraction: 0.35, pcsa: 2 },
  mm_sacrocaudales_ventrales: { origin: [site('os_sacrum', lm('sacrum', 0, -0.03, 0.01))], insertion: [site('vertebrae_caudales', lm('tail_mid', 0, -0.02, 0.006))], nerve: [], artery: ['a_sacralis_mediana'], fibres: 'pennate', tendonFraction: 0.35, pcsa: 1 },
  mm_intertransversarii_caudae: { origin: [site('os_sacrum', lm('sacrum_end', -0.02, 0, 0.03))], insertion: [site('vertebrae_caudales', lm('tail_quarter', 0, 0, 0.02))], nerve: [], artery: ['a_sacralis_mediana'], fibres: 'parallel', tendonFraction: 0.2, pcsa: 1 },
};

/** Bones a tendon or ligament attaches to (the muscles come from MuscleMech.tendons). */
export const TENDON_BONES: Record<string, string[]> = {
  tendo_calcaneus_communis: ['calcaneus'],
  tendo_fds_fl: ['ossa_sesamoidea_proximalia_fl', 'os_compedale_fl', 'os_coronale_fl', 'phalanges_fl'],
  tendo_fdp_fl: ['ossa_sesamoidea_proximalia_fl', 'os_sesamoideum_distale_fl', 'os_ungulare_fl', 'phalanges_fl'],
  tendo_fds_hl: ['calcaneus', 'ossa_sesamoidea_proximalia_hl', 'os_compedale_hl', 'os_coronale_hl', 'phalanges_hl'],
  tendo_fdp_hl: ['ossa_sesamoidea_proximalia_hl', 'os_sesamoideum_distale_hl', 'os_ungulare_hl', 'phalanges_hl'],
  lig_suspensorium_fl: ['os_carpale_tertium', 'ossa_carpi', 'ossa_metacarpalia', 'ossa_sesamoidea_proximalia_fl', 'os_compedale_fl', 'os_coronale_fl', 'phalanges_fl'],
  lig_suspensorium_hl: ['os_tarsale_III', 'ossa_tarsi', 'ossa_metatarsalia', 'ossa_sesamoidea_proximalia_hl', 'os_compedale_hl', 'os_coronale_hl', 'phalanges_hl'],
  lig_accessorium: ['os_carpale_tertium', 'ossa_carpi', 'ossa_metacarpalia'],
  tendo_ext_dig_communis: ['os_compedale_fl', 'os_coronale_fl', 'os_ungulare_fl', 'phalanges_fl'],
  tendo_ext_dig_longus: ['os_compedale_hl', 'os_coronale_hl', 'os_ungulare_hl', 'phalanges_hl'],
  lig_nuchae: ['cranium', 'axis', 'vertebrae_cervicales', 'vertebrae_thoracicae'],
  lamina_nuchae: ['axis', 'vertebrae_cervicales', 'vertebrae_thoracicae'],
  lig_supraspinale: ['vertebrae_thoracicae', 'vertebrae_lumbales', 'os_sacrum'],
  lig_patellae_mediale: ['patella', 'tibia'],
  lig_patellae_intermedium: ['patella', 'tibia'],
  lig_patellae_laterale: ['patella', 'tibia'],
  ligg_cruciata: ['femur', 'tibia'],
  ligg_collateralia_genus: ['femur', 'tibia', 'fibula'],
  ligg_collateralia_carpi: ['radius', 'os_carpi_radiale', 'os_carpi_ulnare', 'ossa_carpi', 'os_metacarpale_II', 'os_metacarpale_IV', 'ossa_metacarpalia'],
  ligg_collateralia_tarsi: ['tibia', 'talus', 'calcaneus', 'ossa_tarsi', 'os_metatarsale_II', 'os_metatarsale_IV', 'ossa_metatarsalia'],
  lig_sacrotuberale_latum: ['os_sacrum', 'vertebrae_caudales', 'os_coxae'],
  ligg_sesamoidea: ['ossa_sesamoidea_proximalia_fl', 'ossa_sesamoidea_proximalia_hl', 'os_compedale_fl', 'os_compedale_hl', 'os_coronale_fl', 'os_coronale_hl', 'phalanges_fl', 'phalanges_hl'],
  lig_accessorium_sdft: ['radius'],
  lig_accessorium_ddft_hl: ['os_tarsale_IV', 'ossa_tarsi', 'ossa_metatarsalia'],
  lig_anulare_palmare: ['ossa_sesamoidea_proximalia_fl', 'ossa_sesamoidea_proximalia_hl'],
  ligg_anularia_digiti: ['os_compedale_fl', 'os_compedale_hl', 'phalanges_fl', 'phalanges_hl'],
  lig_sesamoideum_distale_impar: ['os_sesamoideum_distale_fl', 'os_sesamoideum_distale_hl', 'os_ungulare_fl', 'os_ungulare_hl'],
  ligg_sesamoidea_collateralia: ['os_sesamoideum_distale_fl', 'os_sesamoideum_distale_hl', 'os_compedale_fl', 'os_compedale_hl'],
  ligg_collateralia_digiti_fl: ['ossa_metacarpalia', 'os_compedale_fl', 'os_coronale_fl', 'os_ungulare_fl', 'phalanges_fl'],
  ligg_collateralia_digiti_hl: ['ossa_metatarsalia', 'os_compedale_hl', 'os_coronale_hl', 'os_ungulare_hl', 'phalanges_hl'],
  lig_plantare_longum: ['calcaneus', 'os_tarsale_IV', 'ossa_tarsi', 'os_metatarsale_IV', 'ossa_metatarsalia'],
  lig_capitis_ossis_femoris: ['femur', 'os_coxae'],
  lig_accessorium_ossis_femoris: ['femur', 'os_coxae'],
  ligg_sacroiliaca_dorsalia: ['os_sacrum', 'os_coxae'],
  lacertus_fibrosus: ['radius', 'ossa_metacarpalia'],
  tendo_cuneanus: ['os_tarsale_I_II', 'os_tarsi_centrale', 'ossa_tarsi'],
  tendo_ext_dig_lateralis_fl: ['os_compedale_fl', 'phalanges_fl'],
  tendo_ext_dig_lateralis_hl: ['ossa_metatarsalia', 'os_compedale_hl', 'phalanges_hl'],
  tendo_ext_carpi_radialis: ['ossa_metacarpalia'],
};

export interface JointDef {
  id: string;
  names: { la: string; cs: string; en: string };
  bones: string[];
  /** rig joint driven by the limb motion (if any) */
  motion?: 'shoulder' | 'elbow' | 'carpus' | 'fetlock_fl' | 'hip' | 'stifle' | 'hock' | 'fetlock_hl';
}

/** Joints: which bones articulate (used to link bones with their neighbours). */
export const JOINTS: JointDef[] = [
  { id: 'art_temporomandibularis', names: { la: 'Articulatio temporomandibularis', cs: 'Čelistní kloub', en: 'Temporomandibular joint' }, bones: ['cranium', 'mandibula'] },
  { id: 'art_atlantooccipitalis', names: { la: 'Articulatio atlantooccipitalis', cs: 'Kloub hlavový horní', en: 'Atlanto-occipital joint' }, bones: ['cranium', 'atlas'] },
  { id: 'art_atlantoaxialis', names: { la: 'Articulatio atlantoaxialis', cs: 'Kloub hlavový dolní', en: 'Atlanto-axial joint' }, bones: ['atlas', 'axis'] },
  { id: 'artt_columnae', names: { la: 'Articulationes columnae vertebralis', cs: 'Spojení obratlů', en: 'Joints of the vertebral column' }, bones: ['axis', 'vertebrae_cervicales', 'vertebrae_thoracicae', 'vertebrae_lumbales', 'os_sacrum', 'vertebrae_caudales'] },
  { id: 'artt_costovertebrales', names: { la: 'Articulationes costovertebrales', cs: 'Žeberně-obratlové klouby', en: 'Costovertebral joints' }, bones: ['costae', 'vertebrae_thoracicae'] },
  { id: 'artt_sternocostales', names: { la: 'Articulationes sternocostales', cs: 'Hrudně-žeberní klouby', en: 'Sternocostal joints' }, bones: ['sternum', 'cartilagines_costales', 'costae'] },
  { id: 'art_sacroiliaca', names: { la: 'Articulatio sacroiliaca', cs: 'Křížokyčelní kloub', en: 'Sacroiliac joint' }, bones: ['os_sacrum', 'os_coxae'] },
  { id: 'art_humeri', names: { la: 'Articulatio humeri', cs: 'Ramenní kloub', en: 'Shoulder joint' }, bones: ['scapula', 'humerus'], motion: 'shoulder' },
  { id: 'art_cubiti', names: { la: 'Articulatio cubiti', cs: 'Loketní kloub', en: 'Elbow joint' }, bones: ['humerus', 'radius', 'ulna'], motion: 'elbow' },
  { id: 'art_carpi', names: { la: 'Articulatio carpi', cs: 'Zápěstní kloub', en: 'Carpal joint' }, bones: ['radius', 'ulna', 'os_carpi_radiale', 'os_carpi_intermedium', 'os_carpi_ulnare', 'os_carpi_accessorium', 'os_carpale_secundum', 'os_carpale_tertium', 'os_carpale_quartum', 'ossa_carpi', 'ossa_metacarpalia', 'os_metacarpale_II', 'os_metacarpale_IV'], motion: 'carpus' },
  { id: 'art_metacarpophalangea', names: { la: 'Articulatio metacarpophalangea', cs: 'Spěnkový kloub (hrudní)', en: 'Fetlock joint (fore)' }, bones: ['ossa_metacarpalia', 'ossa_sesamoidea_proximalia_fl', 'os_compedale_fl', 'phalanges_fl'], motion: 'fetlock_fl' },
  { id: 'art_interphalangea_prox_fl', names: { la: 'Articulatio interphalangea proximalis', cs: 'Korunkový kloub (hrudní)', en: 'Pastern joint (fore)' }, bones: ['os_compedale_fl', 'os_coronale_fl'] },
  { id: 'art_interphalangea_dist_fl', names: { la: 'Articulatio interphalangea distalis', cs: 'Kopytní kloub (hrudní)', en: 'Coffin joint (fore)' }, bones: ['os_coronale_fl', 'os_ungulare_fl', 'os_sesamoideum_distale_fl'] },
  { id: 'art_coxae', names: { la: 'Articulatio coxae', cs: 'Kyčelní kloub', en: 'Hip joint' }, bones: ['os_coxae', 'femur'], motion: 'hip' },
  { id: 'art_genus', names: { la: 'Articulatio genus', cs: 'Kolenní kloub', en: 'Stifle joint' }, bones: ['femur', 'patella', 'tibia', 'fibula', 'menisci'], motion: 'stifle' },
  { id: 'art_tarsi', names: { la: 'Articulatio tarsi', cs: 'Hlezenní kloub', en: 'Hock joint' }, bones: ['tibia', 'fibula', 'talus', 'calcaneus', 'os_tarsi_centrale', 'os_tarsale_I_II', 'os_tarsale_III', 'os_tarsale_IV', 'ossa_tarsi', 'ossa_metatarsalia', 'os_metatarsale_II', 'os_metatarsale_IV'], motion: 'hock' },
  { id: 'art_metatarsophalangea', names: { la: 'Articulatio metatarsophalangea', cs: 'Spěnkový kloub (pánevní)', en: 'Fetlock joint (hind)' }, bones: ['ossa_metatarsalia', 'ossa_sesamoidea_proximalia_hl', 'os_compedale_hl', 'phalanges_hl'], motion: 'fetlock_hl' },
  { id: 'art_interphalangea_prox_hl', names: { la: 'Articulatio interphalangea proximalis', cs: 'Korunkový kloub (pánevní)', en: 'Pastern joint (hind)' }, bones: ['os_compedale_hl', 'os_coronale_hl'] },
  { id: 'art_interphalangea_dist_hl', names: { la: 'Articulatio interphalangea distalis', cs: 'Kopytní kloub (pánevní)', en: 'Coffin joint (hind)' }, bones: ['os_coronale_hl', 'os_ungulare_hl', 'os_sesamoideum_distale_hl'] },
];
