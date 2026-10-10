/**
 * Superficial (and some deeper) muscles as surface sheets, shared by all species.
 * Coordinates are body-surface (u, v) for the LEFT side – see SheetRecipe – so the
 * same map adapts to each rig's proportions (the surface parts are normalised):
 *   trunk: v 0 = chest front … 1 = buttock; u 0 dorsal, 0.25 flank, 0.5 belly
 *   neck:  v 0 = base … 1 = head;           u 0 crest, 0.25 side, 0.5 throat
 *   head:  v 0 = poll … 1 = nose;           u 0 forehead, 0.25 cheek, 0.5 jaw
 *   limbs: v 0 = inside trunk … 1 = coffin; u 0 cranial, 0.25 lateral, 0.5 caudal
 * The layout follows the horse écorché; muscles absent in a species are simply
 * filtered out by the catalogue.
 */
import type { GeometryRecipe, SheetRecipe } from '../types.ts';

const sheet = (part: SheetRecipe['part'], corners: SheetRecipe['corners'], bulge: number, extra: Partial<SheetRecipe> = {}): SheetRecipe => ({ type: 'sheet', part, corners, bulge, ...extra });

export const QUADRUPED_SHEETS: Record<string, GeometryRecipe | GeometryRecipe[]> = {
  // ------------------------------------------------------------ head
  m_masseter: sheet('head', [[0.17, 0.64], [0.18, 0.38], [0.45, 0.25], [0.44, 0.55]], 0.028, { layer: 1 }),
  m_temporalis: sheet('head', [[0.08, 0.1], [0.2, 0.13], [0.2, 0.3], [0.07, 0.3]], 0.012, { layer: 1 }),
  m_buccinator: sheet('head', [[0.27, 0.64], [0.42, 0.59], [0.42, 0.9], [0.29, 0.9]], 0.008, { layer: 1 }),
  m_levator_labii_superioris: sheet('head', [[0.11, 0.52], [0.2, 0.54], [0.19, 0.93], [0.11, 0.93]], 0.007, { layer: 2 }),
  m_levator_nasolabialis: sheet('head', [[0.09, 0.48], [0.2, 0.5], [0.23, 0.94], [0.09, 0.95]], 0.006, { layer: 1 }),
  m_depressor_labii_inferioris: sheet('head', [[0.42, 0.62], [0.49, 0.6], [0.49, 0.93], [0.43, 0.93]], 0.006, { layer: 1 }),
  m_orbicularis_oris: [
    sheet('head', [[0.08, 0.93], [0.5, 0.93], [0.5, 0.995], [0.08, 0.995]], 0.008, { layer: 1 }),
    sheet('head', [[0.5, 0.93], [0.92, 0.93], [0.92, 0.995], [0.5, 0.995]], 0.008, { layer: 1 }),
  ],
  m_zygomaticus: sheet('head', [[0.2, 0.44], [0.26, 0.46], [0.29, 0.9], [0.23, 0.9]], 0.004, { layer: 1 }),
  // ------------------------------------------------------------ neck
  m_rhomboideus: [
    sheet('neck', [[-0.02, 0.02], [0.035, 0.02], [0.035, 0.78], [-0.02, 0.78]], 0.014, { layer: 1 }),
    sheet('trunk', [[0.0, 0.14], [0.0, 0.3], [0.05, 0.3], [0.05, 0.16]], 0.012, { layer: 2 }),
  ],
  m_splenius: sheet('neck', [[0.035, 0.04], [0.19, 0.08], [0.17, 0.93], [0.035, 0.9]], 0.028, { layer: 1 }),
  m_semispinalis_capitis: sheet('neck', [[0.02, 0.0], [0.12, 0.0], [0.1, 0.95], [0.02, 0.95]], 0.03, { layer: 2 }),
  m_serratus_ventralis: [
    sheet('neck', [[0.19, 0.0], [0.34, 0.0], [0.3, 0.55], [0.19, 0.5]], 0.014, { layer: 2 }),
    sheet('trunk', [[0.32, 0.06], [0.27, 0.46], [0.1, 0.24], [0.08, 0.1]], 0.014, { layer: 2 }),
  ],
  m_omotransversarius: sheet('neck', [[0.19, 0.05], [0.26, 0.05], [0.2, 0.9], [0.145, 0.9]], 0.01, { layer: 1 }),
  m_brachiocephalicus: [
    sheet('neck', [[0.26, 0.0], [0.42, 0.0], [0.38, 0.94], [0.24, 0.92]], 0.022, { layer: 1 }),
    sheet('fl', [[-0.09, 0.03], [0.11, 0.03], [0.12, 0.36], [-0.04, 0.36]], 0.02, { layer: 1 }),
  ],
  m_sternocephalicus: sheet('neck', [[0.4, 0.0], [0.465, 0.0], [0.46, 0.95], [0.38, 0.92]], 0.016, { layer: 1 }),
  m_sternohyoideus: sheet('neck', [[0.465, 0.0], [0.535, 0.0], [0.53, 0.95], [0.47, 0.95]], 0.006, { layer: 1 }),
  m_omohyoideus: sheet('neck', [[0.3, 0.08], [0.36, 0.08], [0.47, 0.9], [0.43, 0.9]], 0.004, { layer: 2 }),
  m_trapezius: [
    sheet('neck', [[0.02, 0.6], [0.02, 0.1], [0.18, 0.0], [0.1, 0.0]], 0.006, { layer: 1 }),
    sheet('trunk', [[0.012, 0.08], [0.012, 0.42], [0.21, 0.24], [0.17, 0.1]], 0.006, { layer: 1 }),
  ],
  m_longus_colli: sheet('neck', [[0.46, 0.0], [0.54, 0.0], [0.53, 0.9], [0.47, 0.9]], 0.012, { layer: 3 }),
  // ------------------------------------------------------------ trunk
  m_longissimus_dorsi: sheet('trunk', [[-0.012, 0.1], [-0.012, 0.82], [0.1, 0.8], [0.09, 0.1]], 0.05, { layer: 2 }),
  m_latissimus_dorsi: sheet('trunk', [[0.03, 0.2], [0.03, 0.62], [0.31, 0.2], [0.22, 0.11]], 0.012, { layer: 1, mids: [[0.03, 0.42], [0.2, 0.44], null, null] }),
  m_obliquus_externus_abdominis: sheet('trunk', [[0.14, 0.34], [0.12, 0.7], [0.44, 0.84], [0.47, 0.44]], 0.014, { layer: 1 }),
  m_obliquus_internus_abdominis: sheet('trunk', [[0.18, 0.72], [0.1, 0.78], [0.45, 0.6], [0.45, 0.82]], 0.012, { layer: 2 }),
  m_transversus_abdominis: sheet('trunk', [[0.12, 0.45], [0.12, 0.8], [0.48, 0.8], [0.48, 0.45]], 0.01, { layer: 3 }),
  m_rectus_abdominis: sheet('trunk', [[0.49, 0.3], [0.49, 0.9], [0.43, 0.9], [0.43, 0.3]], 0.016, { layer: 1 }),
  mm_intercostales: sheet('trunk', [[0.1, 0.1], [0.1, 0.64], [0.48, 0.64], [0.48, 0.14]], 0.008, { layer: 2 }),
  m_pectoralis_superficialis: sheet('trunk', [[0.5, 0.02], [0.5, 0.13], [0.36, 0.13], [0.37, 0.03]], 0.016, { layer: 1 }),
  m_pectoralis_profundus: sheet('trunk', [[0.5, 0.14], [0.5, 0.46], [0.3, 0.12], [0.4, 0.05]], 0.016, { layer: 1, mids: [null, [0.38, 0.34], null, null] }),
  m_iliocostalis: sheet('trunk', [[0.1, 0.18], [0.11, 0.74], [0.14, 0.74], [0.13, 0.18]], 0.012, { layer: 2 }),
  m_serratus_dorsalis: [
    sheet('trunk', [[0.09, 0.08], [0.09, 0.3], [0.16, 0.3], [0.16, 0.08]], 0.005, { layer: 3 }),
    sheet('trunk', [[0.09, 0.5], [0.09, 0.76], [0.16, 0.76], [0.16, 0.5]], 0.005, { layer: 3 }),
  ],
  m_spinalis: sheet('trunk', [[0.0, 0.12], [0.0, 0.6], [0.03, 0.6], [0.03, 0.12]], 0.02, { layer: 3 }),
  m_gluteus_medius: sheet('trunk', [[0.0, 0.64], [0.0, 0.97], [0.2, 0.97], [0.25, 0.72]], 0.04, { layer: 1 }),
  m_gluteus_superficialis: sheet('trunk', [[0.25, 0.74], [0.21, 0.9], [0.3, 0.95], [0.33, 0.8]], 0.012, { layer: 1 }),
  // ------------------------------------------------------------ forelimb
  m_supraspinatus: sheet('fl', [[-0.1, 0.0], [0.08, 0.0], [0.06, 0.2], [-0.08, 0.2]], 0.02, { layer: 2 }),
  m_infraspinatus: sheet('fl', [[0.1, 0.0], [0.3, 0.0], [0.27, 0.2], [0.12, 0.2]], 0.02, { layer: 2 }),
  m_deltoideus: sheet('fl', [[0.12, 0.08], [0.3, 0.1], [0.26, 0.31], [0.14, 0.33]], 0.016, { layer: 1 }),
  m_triceps_brachii: sheet('fl', [[0.3, 0.08], [0.56, 0.12], [0.55, 0.42], [0.33, 0.42]], 0.04, { layer: 1 }),
  m_brachialis: sheet('fl', [[0.2, 0.2], [0.34, 0.22], [0.3, 0.43], [0.19, 0.42]], 0.012, { layer: 2 }),
  m_tensor_fasciae_antebrachii: sheet('fl', [[0.58, 0.14], [0.7, 0.14], [0.68, 0.42], [0.58, 0.44]], 0.006, { layer: 1 }),
  m_biceps_brachii: sheet('fl', [[0.72, 0.14], [0.95, 0.14], [0.93, 0.42], [0.74, 0.42]], 0.02, { layer: 2 }),
  m_extensor_carpi_radialis: sheet('fl', [[-0.07, 0.4], [0.1, 0.4], [0.06, 0.7], [-0.04, 0.7]], 0.02, { layer: 1 }),
  m_extensor_digitorum_communis: sheet('fl', [[0.1, 0.42], [0.2, 0.42], [0.18, 0.7], [0.08, 0.7]], 0.012, { layer: 1 }),
  m_extensor_digitorum_lateralis: sheet('fl', [[0.2, 0.44], [0.28, 0.44], [0.27, 0.7], [0.2, 0.7]], 0.008, { layer: 1 }),
  m_extensor_carpi_ulnaris: sheet('fl', [[0.28, 0.43], [0.41, 0.43], [0.41, 0.7], [0.29, 0.7]], 0.014, { layer: 1 }),
  m_flexor_carpi_ulnaris: sheet('fl', [[0.41, 0.42], [0.53, 0.42], [0.53, 0.7], [0.43, 0.7]], 0.012, { layer: 1 }),
  m_flexor_carpi_radialis: sheet('fl', [[0.53, 0.42], [0.66, 0.42], [0.66, 0.7], [0.55, 0.7]], 0.012, { layer: 1 }),
  m_flexor_digitorum_superficialis_fl: sheet('fl', [[0.42, 0.44], [0.6, 0.44], [0.58, 0.7], [0.44, 0.7]], 0.012, { layer: 2 }),
  m_flexor_digitorum_profundus_fl: sheet('fl', [[0.38, 0.44], [0.62, 0.44], [0.6, 0.7], [0.4, 0.7]], 0.016, { layer: 3 }),
  m_abductor_digiti_I_longus: sheet('fl', [[0.2, 0.58], [0.29, 0.6], [0.0, 0.73], [-0.06, 0.7]], 0.004, { layer: 1 }),
  // ------------------------------------------------------------ hindlimb
  m_tensor_fasciae_latae: sheet('hl', [[0.02, 0.16], [0.18, 0.2], [0.2, 0.47], [0.02, 0.47]], 0.02, { layer: 1 }),
  m_biceps_femoris: sheet('hl', [[0.2, 0.1], [0.46, 0.12], [0.46, 0.58], [0.21, 0.5]], 0.05, { layer: 1, mids: [null, [0.5, 0.35], null, null] }),
  m_semitendinosus: sheet('hl', [[0.46, 0.12], [0.6, 0.14], [0.58, 0.58], [0.47, 0.58]], 0.035, { layer: 1 }),
  m_semimembranosus: sheet('hl', [[0.6, 0.14], [0.74, 0.16], [0.72, 0.5], [0.6, 0.5]], 0.03, { layer: 1 }),
  m_quadriceps_femoris: sheet('hl', [[-0.02, 0.22], [0.2, 0.22], [0.18, 0.48], [-0.02, 0.48]], 0.03, { layer: 2 }),
  m_rectus_femoris: sheet('hl', [[-0.06, 0.2], [0.08, 0.2], [0.06, 0.46], [-0.05, 0.46]], 0.028, { layer: 2 }),
  m_vastus_lateralis: sheet('hl', [[0.08, 0.22], [0.2, 0.22], [0.18, 0.47], [0.07, 0.47]], 0.024, { layer: 2 }),
  m_vastus_medialis: sheet('hl', [[0.8, 0.22], [0.94, 0.22], [0.93, 0.47], [0.82, 0.47]], 0.02, { layer: 2 }),
  m_gracilis: sheet('hl', [[0.74, 0.18], [0.92, 0.18], [0.9, 0.5], [0.74, 0.5]], 0.014, { layer: 1 }),
  m_sartorius: sheet('hl', [[0.92, 0.16], [0.98, 0.16], [0.96, 0.5], [0.9, 0.5]], 0.006, { layer: 1 }),
  m_gastrocnemius: sheet('hl', [[0.38, 0.48], [0.62, 0.48], [0.6, 0.67], [0.4, 0.67]], 0.03, { layer: 1 }),
  m_flexor_digitorum_superficialis_hl: sheet('hl', [[0.42, 0.49], [0.58, 0.49], [0.56, 0.68], [0.44, 0.68]], 0.014, { layer: 2 }),
  m_flexor_digitorum_profundus_hl: sheet('hl', [[0.26, 0.5], [0.44, 0.5], [0.44, 0.68], [0.28, 0.68]], 0.016, { layer: 2 }),
  m_extensor_digitorum_longus: sheet('hl', [[-0.06, 0.47], [0.1, 0.47], [0.08, 0.68], [-0.05, 0.68]], 0.018, { layer: 1 }),
  m_extensor_digitorum_lateralis_hl: sheet('hl', [[0.13, 0.48], [0.25, 0.5], [0.24, 0.68], [0.14, 0.68]], 0.01, { layer: 1 }),
  m_tibialis_cranialis: sheet('hl', [[0.02, 0.5], [0.14, 0.5], [0.12, 0.68], [0.02, 0.68]], 0.012, { layer: 2 }),
  m_fibularis_tertius: sheet('hl', [[0.0, 0.48], [0.1, 0.48], [0.08, 0.69], [0.0, 0.69]], 0.006, { layer: 3 }),
  m_popliteus: sheet('hl', [[0.36, 0.46], [0.5, 0.46], [0.48, 0.52], [0.38, 0.52]], 0.008, { layer: 2 }),
};
