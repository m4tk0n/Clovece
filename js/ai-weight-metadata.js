// Metadata for the 1000-slot configuration. System-only slots are not trainable.
const FIRST = [{"id":1,"name":"w_capture","desc":"Ofenziva: Vyhození soupeřovy figurky na hlavní trase"},{"id":2,"name":"w_capture_home_stretch","desc":"Ofenziva: Vyhození soupeře blízko jeho domečku"},{"id":3,"name":"w_capture_base_exit","desc":"Ofenziva: Vyhození soupeře těsně po jeho startu"},{"id":4,"name":"w_chase_target","desc":"Ofenziva: Přibližování se k soupeřově figurce zepředu"},{"id":5,"name":"w_block_path","desc":"Ofenziva: Blokování cesty soupeřově figurce"},{"id":6,"name":"w_force_split","desc":"Ofenziva: Snaha rozdělit soupeřovu skupinu figurek"},{"id":7,"name":"w_pressure_leader","desc":"Ofenziva: Cílený útok na vedoucího hráče v partii"},{"id":8,"name":"w_trap_setup","desc":"Ofenziva: Příprava pozice pro budoucí vyhození"},{"id":9,"name":"w_corner_attack","desc":"Ofenziva: Útok při přechodu rohů hrací desky"},{"id":10,"name":"w_last_piece_hunt","desc":"Ofenziva: Lov poslední soupeřovy figurky na desce"},{"id":11,"name":"w_self_capture_deploy","desc":"Taktika: Vyhození vlastní figurky na startu při povinném nasazení"},{"id":12,"name":"w_risk_penalty","desc":"Defenziva: Základní trest za ohrožení vlastní figurky soupeřem"},{"id":13,"name":"w_escape_danger","desc":"Defenziva: Útěk figurky z bezprostředního ohrožení"},{"id":14,"name":"w_spread_pieces","desc":"Defenziva: Rozprostření figur po hlavní trase"},{"id":15,"name":"w_hide_behind_safe","desc":"Defenziva: Krytí figurky za výhodnější pozicí"},{"id":16,"name":"w_avoid_killing_zone","desc":"Defenziva: Vyhýbání se rizikovým políčkům na trase"},{"id":17,"name":"w_group_defense","desc":"Defenziva: Držedení vlastních figur blízko sebe"},{"id":18,"name":"w_shield_rear","desc":"Defenziva: Ochrana zadní figurky přední figurou"},{"id":19,"name":"w_retreat_caution","desc":"Defenziva: Opatrný postup, pokud hrozí protiútok"},{"id":20,"name":"w_base_defense_hold","desc":"Defenziva: Vyčkávání ve startovní základně"},{"id":21,"name":"w_step_forward","desc":"Postup: Základní bod za každý posun kupředu na trase"},{"id":22,"name":"w_distance_multiplier","desc":"Postup: Násobitel za celkovou vzdálenost od startu"},{"id":23,"name":"w_enter_home_stretch","desc":"Postup: Vstup do domácího sloupce (D1)"},{"id":24,"name":"w_reach_goal","desc":"Postup: Dosažení konečné pozice D4 (vítězství figurky)"},{"id":25,"name":"w_home_stretch_step","desc":"Domácí sloupec: Posun uvnitř sloupce (D1 -> D2 -> D3)"},{"id":26,"name":"w_home_stretch_deep","desc":"Domácí sloupec: Hlubší pozice v domácím sloupci"},{"id":27,"name":"w_home_stretch_penult","desc":"Domácí sloupec: Pozice D3 před posledním krokem do D4"},{"id":28,"name":"w_board_progress_rate","desc":"Postup: Celkové procento postupu přes hlavní trasu"},{"id":29,"name":"w_forward_momentum","desc":"Postup: Udržení tempa směrem k domácímu sloupci"},{"id":30,"name":"w_finish_line_focus","desc":"Postup: Priorita dokončení hry před zbytečným bojem"},{"id":31,"name":"w_leave_base","desc":"Základna: Vyvedení figurky na startovní pole při hodu 6"},{"id":32,"name":"w_keep_reserve_in_base","desc":"Základna: Strategické ponechání figury v záloze"},{"id":33,"name":"w_all_out_base","desc":"Základna: Snaha vyprázdnit základnu co nejdříve"},{"id":34,"name":"w_base_lock_penalty","desc":"Základna: Trest za dlouhé setrvání všech figur v základně"},{"id":35,"name":"w_first_piece_out","desc":"Základna: Bonus za první úspěšně vyvedenou figurku"},{"id":36,"name":"w_last_piece_out","desc":"Základna: Bonus za vyvedení poslední figury ze základny"},{"id":37,"name":"w_base_exit_safety","desc":"Základna: Kontrola bezpečí při výstupu na start"},{"id":38,"name":"w_base_queue_order","desc":"Základna: Pořadí vytahování figurek ven"},{"id":39,"name":"w_emergency_base_spawn","desc":"Základna: Nouzové nasazení při obklíčení soupeřem"},{"id":40,"name":"w_base_potential_val","desc":"Základna: Hodnota nevyužitého potenciálu v základně"},{"id":41,"name":"mod_losing_aggression","desc":"Dynamika: Bonus k útočnosti při prohře v partii"},{"id":42,"name":"mod_winning_defense","desc":"Dynamika: Bonus k opatrnosti při vedení"},{"id":43,"name":"mod_endgame_speed","desc":"Dynamika: Zrychlení v závěrečné fázi hry"},{"id":44,"name":"mod_early_game_spread","desc":"Dynamika: Rozptyl na začátku partie"},{"id":45,"name":"mod_midgame_chaos","desc":"Dynamika: Zvýšení rizikovosti ve střední hře"},{"id":46,"name":"mod_comeback_boost","desc":"Dynamika: Extra vzpruha pro prohrávajícího bota"},{"id":47,"name":"mod_leader_target_mult","desc":"Dynamika: Násobitel agrese vůči aktuálnímu lídrovi"},{"id":48,"name":"mod_time_pressure","desc":"Dynamika: Úprava chování při dlouhé hře"},{"id":49,"name":"mod_desperation_mode","desc":"Dynamika: Mód maximálního rizika při hrozbě prohry"},{"id":50,"name":"mod_cruising_mode","desc":"Dynamika: Stabilní klidná jízda při vyrovnaném stavu"},{"id":51,"name":"weight_randomness_factor","desc":"Náhodnost: Lidský šum / odchylka ve výběru tahů"},{"id":52,"name":"w_prefer_leader_piece","desc":"Preference: Podpora figurky nejdále na desce"},{"id":53,"name":"w_prefer_laggard_piece","desc":"Preference: Podpora figurky vzadu"},{"id":54,"name":"w_balanced_weight","desc":"Preference: Celková vyváženost tahů"},{"id":55,"name":"w_dice_six_priority","desc":"Pravidla: Strategie při hodu 6 (vyjít vs. táhnout)"},{"id":56,"name":"w_extra_turn_value","desc":"Pravidla: Využití bonusového hodu za šestku"},{"id":57,"name":"w_multi_piece_synergy","desc":"Pravidla: Spolupráce více figur na desce"},{"id":58,"name":"w_path_efficiency","desc":"Optimalizace: Výběr nejkratší cesty do cíle"},{"id":59,"name":"w_obstacle_avoidance","desc":"Optimalizace: Obcházení zablokovaných míst"},{"id":60,"name":"w_risk_reward_ratio","desc":"Optimalizace: Poměr mezi rizikem a ziskem"},{"id":61,"name":"p_dist_1_danger","desc":"Pravděpodobnost: Riziko úderu při vzdálenosti 1 políčko"},{"id":62,"name":"p_dist_2_danger","desc":"Pravděpodobnost: Riziko při vzdálenosti 2 políčka"},{"id":63,"name":"p_dist_3_danger","desc":"Pravděpodobnost: Riziko při vzdálenosti 3 políčka"},{"id":64,"name":"p_dist_4_danger","desc":"Pravděpodobnost: Riziko při vzdálenosti 4 políčka"},{"id":65,"name":"p_dist_5_danger","desc":"Pravděpodobnost: Riziko při vzdálenosti 5 políček"},{"id":66,"name":"p_dist_6_danger","desc":"Pravděpodobnost: Riziko při vzdálenosti 6 políček"},{"id":67,"name":"p_spawn_threat","desc":"Pravděpodobnost: Hrozba nasazení soupeře (padla šestka)"},{"id":68,"name":"p_double_hit_risk","desc":"Pravděpodobnost: Riziko vyhození vícenásobným tahem"},{"id":69,"name":"p_safe_distance_bonus","desc":"Pravděpodobnost: Bonus za bezpečný odstup od soupeře"},{"id":70,"name":"p_exposure_mitigation","desc":"Pravděpodobnost: Snížení trestu při krytí vlastní figurou"},{"id":71,"name":"ai_personality_bias","desc":"AI Profil: Celkový sklon povahy bota"},{"id":72,"name":"ai_aggression_coeff","desc":"AI Profil: Koeficient celkové agresivity"},{"id":73,"name":"ai_caution_coeff","desc":"AI Profil: Koeficient opatrnosti"},{"id":74,"name":"ai_greed_coeff","desc":"AI Profil: Koeficient chamtivosti (rychlý postup)"},{"id":75,"name":"ai_memory_weight","desc":"AI Profil: Zohlednění předchozích tahů soupeře"},{"id":76,"name":"ai_blunder_rate","desc":"AI Profil: Pravděpodobnost úmyslné chyby"},{"id":77,"name":"ai_calculation_depth","desc":"AI Profil: Hloubka prohledávání stromu tahů"},{"id":78,"name":"ai_simulation_samples","desc":"AI Profil: Počet simulačních vzorků"},{"id":79,"name":"ai_adaptability_rate","desc":"AI Profil: Rychlost přizpůsobení strategii"},{"id":80,"name":"ai_stubbornness","desc":"AI Profil: Setrvání u jedné zvolené taktiky"},{"id":81,"name":"board_size_40_val","desc":"Deska: Specifická váha pro klasickou desku se 40 poli"},{"id":82,"name":"board_size_48_val","desc":"Deska: Specifická váha pro desku se 48 poli"},{"id":83,"name":"board_size_80_val","desc":"Deska: Specifická váha pro velkou desku s 80 poli"},{"id":84,"name":"board_players_2","desc":"Hra: Váha pro hru ve 2 hráčích"},{"id":85,"name":"board_players_4","desc":"Hra: Váha pro hru ve 4 hráčích"},{"id":86,"name":"board_players_6","desc":"Hra: Váha pro hru v 6 hráčích"},{"id":87,"name":"board_players_8","desc":"Hra: Váha pro hru v 8 hráčích"},{"id":88,"name":"corner_turn_bonus","desc":"Pozice desky: Zvládnutí přechodu rohů desky"},{"id":89,"name":"home_entrance_val","desc":"Pozice desky: Poloha před odbočením do domácího sloupce"},{"id":90,"name":"board_symmetry_pref","desc":"Pozice desky: Preference symetrického rozestavění"},{"id":91,"name":"rule_three_rolls_active","desc":"Pravidlo threeRolls: Váha aktivního režimu tří pokusů o šestku"},{"id":92,"name":"rule_must_deploy_active","desc":"Pravidlo mustDeploy: Váha vynuceného nasazení při hodu 6"},{"id":93,"name":"rule_skip_home_active","desc":"Pravidlo skipHomePieces: Váha přeskakování v domácím sloupci"},{"id":94,"name":"rule_must_enter_home_active","desc":"Pravidlo mustEnterHome: Váha povinného vstupu do domku"},{"id":95,"name":"rule_three_sixes_penalty_active","desc":"Pravidlo threeSixesPenalty: Trestná váha při 3 šestkách"},{"id":96,"name":"mode_local_preset","desc":"Režim: Indikátor místní hry (flexibilní rozšíření)"},{"id":97,"name":"mode_online_preset","desc":"Režim: Indikátor online hry (pevná pravidla)"},{"id":98,"name":"strict_rules_mode","desc":"Systém: Vynucení přísných pravidel a odmítnutí nelegálních tahů"},{"id":99,"name":"ui_highlight_best","desc":"Systém: Zvýraznění nejlepšího tahu v rozhraní"},{"id":100,"name":"master_difficulty_preset","desc":"Systém: Celková úroveň obtížnosti (1=lehká, 2=střední, 3=těžká)"}];
const CHANNELS = ['postup','útok','obrana','domácí sloupec','nasazení','tlak na soupeře','dokončení','pozice na trase','flexibilita','riziko'];
const RESERVED = id => (id >= 417 && id <= 430) || (id >= 441 && id <= 500) || (id >= 941 && id <= 960) || (id >= 971 && id <= 1000);
const DIFFICULTY = {
401:['obtiznost_lehka_agrese','Obtížnost lehká: útočná váha'],402:['obtiznost_lehka_riziko','Obtížnost lehká: vnímání hrozeb'],403:['obtiznost_stredni_agrese','Obtížnost střední: útočná váha'],404:['obtiznost_stredni_riziko','Obtížnost střední: vnímání rizika'],405:['obtiznost_tezka_agrese','Obtížnost těžká: útočná efektivita'],406:['obtiznost_tezka_riziko','Obtížnost těžká: opatrnost'],407:['preset_hard_simulation_depth','Obtížnost těžká: hloubka simulace'],408:['preset_easy_blunder_rate','Obtížnost lehká: četnost chyb'],409:['preset_medium_blunder_rate','Obtížnost střední: četnost chyb'],410:['preset_hard_blunder_rate','Obtížnost těžká: četnost chyb'],411:['preset_easy_randomness','Obtížnost lehká: náhodnost'],412:['preset_medium_randomness','Obtížnost střední: náhodnost'],413:['preset_hard_randomness','Obtížnost těžká: náhodnost'],414:['preset_easy_risk_multiplier','Obtížnost lehká: násobitel rizika'],415:['preset_medium_risk_multiplier','Obtížnost střední: násobitel rizika'],416:['preset_hard_risk_multiplier','Obtížnost těžká: násobitel rizika']
};
export const AI_WEIGHT_CHANNELS = Object.freeze(CHANNELS);
export function isTrainableAIWeight(id) { const n=Number(id); return Number.isInteger(n) && n>=1 && n<=1000 && !RESERVED(n); }
export function getAIWeightMetadata(id) {
 const n=Number(id); if (!isTrainableAIWeight(n)) return null;
 if (n<=100) return FIRST[n-1];
 if (DIFFICULTY[n]) return {id:n,name:DIFFICULTY[n][0],desc:DIFFICULTY[n][1]};
 const series = [
  [101,110,'taktika_krok_','Analýza: Hloubková analýza kroku '],
  [111,120,'souper_vzdalenost_','Kontaktní zóna: Vzdálenost soupeře '],
  [123,128,'kostka_sance_','Kostka: Váha hodu '],
  [141,150,'extended_metric_alpha_','Rozšíření: Alfa metrika políčka '],
  [151,160,'extended_metric_beta_','Rozšíření: Beta penalizace '],
  [161,170,'path_weight_node_','Cesta: Váha uzlu na trase '],
  [171,180,'turn_penalty_step_','Tahy: Penalizace za zdržení '],
  [181,190,'board_zone_weight_','Zóny: Váha zóny desky '],
  [191,200,'sub_heuristic_mod_','Sub-heuristika: Modifikátor '],
  [201,210,'prob_model_factor_','Pravděpodobnostní model: Faktor '],
  [211,220,'threat_distance_weight_','Hrozby: Váha ohrožení na vzdálenost '],
  [221,230,'dice_expectation_bias_','Kostka: Očekávaná pravděpodobnostní úprava pro hod '],
  [231,240,'safety_cell_bonus_','Bezpečí: Bonus za bezpečnou buňku '],
  [241,250,'simulation_weight_param_','Simulace: Parametr simulačního uzlu '],
  [251,260,'monte_carlo_factor_','Monte Carlo: Vzorkovací faktor '],
  [261,270,'heuristic_layer_val_','Heuristická vrstva: Hodnoticí vrstva '],
  [271,280,'aggression_profile_mod_','Agrese: Útočný modifikátor '],
  [281,290,'defense_profile_mod_','Defenziva: Obranný modifikátor '],
  [291,300,'speed_profile_mod_','Rychlost: Rychlostní modifikátor '],
  [301,310,'dynamic_state_var_','Dynamický stav: Proměnná stavu '],
  [321,330,'piece_coordination_w_','Koordinace: Váha spolupráce figur '],
  [331,340,'board_position_score_','Pozice desky: Skóre pozice '],
  [341,350,'risk_mitigation_factor_','Riziko: Ochranný faktor '],
  [351,360,'goal_orientation_w_','Cíl: Směrová váha '],
  [361,370,'home_stretch_modifier_','Domácí sloupec: Modifikátor '],
  [371,380,'opponent_modeling_factor_','Model soupeře: Predikční faktor '],
  [381,390,'meta_heuristic_weight_','Meta-heuristika: Nadstavbová váha '],
  [391,400,'strategy_blend_ratio_','Strategie: Míchací poměr '],
  [431,440,'extra_tuning_param_','Ladění: Doplňkový parametr '],
  [501,510,'tactical_weight_alpha_','Taktická váha Alpha '],
  [511,520,'tactical_weight_beta_','Taktická penalizace Beta '],
  [521,530,'board_cluster_factor_','Shlukování: Faktor shluku figurek '],
  [531,540,'offensive_momentum_','Ofenzivní momentum '],
  [541,550,'defensive_stability_','Obranná stabilita '],
  [551,560,'routing_weight_step_','Směrování kroku '],
  [561,570,'interception_chance_w_','Šance na zachycení '],
  [571,580,'retreat_penalty_w_','Penalizace ústupu '],
  [581,590,'tempo_control_factor_','Kontrola tempa '],
  [591,600,'parity_eval_metric_','Paritní metrika '],
  [601,610,'spatial_awareness_w_','Prostorové vnímání: Váha prostoru '],
  [611,620,'threat_matrix_factor_','Matice hrozeb: Faktor '],
  [621,630,'opportunity_cost_w_','Náklady obětované příležitosti '],
  [631,640,'pawn_isolation_penalty_','Penalizace izolované figurky '],
  [641,650,'synergy_multiplier_','Synergie: Násobitel '],
  [651,660,'endgame_conversion_w_','Koncovka: Konverzní váha '],
  [661,670,'board_pressure_index_','Index tlaku na desce '],
  [671,680,'risk_tolerance_mod_','Riziko: Modifikátor tolerance '],
  [681,690,'heuristic_bias_v','Heuristický bias V'],
  [691,700,'ai_evaluation_scalar_','AI skalární hodnocení '],
  [701,710,'sim_branching_factor_','Větvení simulace '],
  [711,720,'move_prioritization_w_','Prioritizace tahu '],
  [721,730,'board_occupancy_cost_','Náklady obsazení desky '],
  [731,740,'tactical_depth_scaler_','Skalér hloubky taktiky '],
  [741,750,'heuristic_weight_factor_','Heuristický váhový faktor '],
  [751,760,'safe_path_preference_','Preference bezpečné cesty '],
  [761,770,'aggression_ramp_rate_','Míra nárůstu agrese '],
  [771,780,'board_state_eval_w_','Evaluace stavu desky '],
  [781,790,'piece_mobility_index_','Index mobility figurky '],
  [791,800,'game_tempo_modifier_','Modifikátor herního tempa '],
  [801,810,'position_eval_bonus_','Evaluace pozice: Bonus za strategické pole '],
  [811,820,'vulnerability_score_','Zranitelnost: Penalizace pozice '],
  [821,830,'capture_incentive_w_','Motivace vyhodit: Bonus '],
  [831,840,'home_entry_priority_','Priorita vstupu do domku '],
  [841,850,'deploy_urgency_mult_','Naléhavost nasazení: Násobitel '],
  [851,860,'chain_sixes_strategy_','Strategie řetězení šestek '],
  [861,870,'opponent_lead_penalty_','Penalizace při vedení soupeře '],
  [871,880,'pawn_advancement_w_','Váha postupu figurky '],
  [881,890,'blocking_efficiency_','Efektivita blokování cesty '],
  [891,900,'safe_landing_bonus_','Bonus za bezpečné přistání '],
  [901,910,'final_stretch_boost_','Závěrečný boost v domácím sloupci '],
  [911,920,'error_recovery_w_','Zotavení po chybě '],
  [921,930,'stochastic_weight_','Stochastická váha '],
  [931,940,'master_controller_gain_','Zisk hlavního regulátoru ']
 ];
 const group=series.find(([from,to])=>n>=from&&n<=to);
 if(group){
  const index=n-group[0]+1;
  const suffix=group[1]===690&&group[0]===681?String(index):String(index);
  const name=group[2]+suffix;
  return {id:n,name,desc:group[3]+index};
 }
 const special = {
  121:['pohyb_start_bonus','Pravděpodobnost: Bonus za startovní výpad po nasazení'],
  122:['pohyb_cile_bonus','Pravděpodobnost: Bonus za přiblížení k cílovému domácímu sloupci'],
  129:['simulace_hloubka_max','Simulace: Maximální hloubka rekurzivního prohledávání'],
  130:['simulace_uzly_limit','Simulace: Limit prohledávaných uzlů v jednom tahu AI'],
  131:['faze_hry_zacatek','Fáze hry: Koeficient pro zahájení partie'],
  132:['faze_hry_stred','Fáze hry: Koeficient pro střední fázi hry'],
  133:['faze_hry_konec','Fáze hry: Koeficient pro koncovou fázi hry'],
  134:['adaptace_rychlost','Adaptace: Rychlost přizpůsobení AI stylu soupeře'],
  135:['emoce_agrese_faktor','Emoce AI: Zvyšování agrese'],
  136:['emoce_strach_faktor','Emoce AI: Zvyšování opatrnosti'],
  137:['pamet_tahu_delka','Paměť: Počet zapamatovaných tahů soupeře'],
  138:['blunder_multiplier','Chyby: Šance na úmyslnou lehkou chybu'],
  139:['krizova_situace_boost','Krize: Bonus při hrozbě celkové prohry'],
  140:['vitezna_vora_boost','Vedení: Bonus při těsném vedení v partii'],
  311:['game_phase_early_mult','Fáze hry: Časný násobitel pro začátek partie'],
  312:['game_phase_mid_mult','Fáze hry: Střední násobitel pro rozehranou desku'],
  313:['game_phase_late_mult','Fáze hry: Pozdní násobitel pro pokročilou fázi'],
  314:['game_phase_end_mult','Fáze hry: Koncový násobitel pro boj o domky'],
  315:['game_phase_transition_1','Fáze hry: Procentuální hranice přechodu 1'],
  316:['game_phase_transition_2','Fáze hry: Procentuální hranice přechodu 2'],
  317:['game_phase_transition_3','Fáze hry: Procentuální hranice přechodu 3'],
  318:['adaptive_modifier_cap','Adaptace: Horní limit dynamického modifikátoru'],
  319:['adaptive_modifier_floor','Adaptace: Dolní limit dynamického modifikátoru'],
  320:['adaptive_learning_rate','Adaptace: Rychlost přizpůsobení AI za běhu hry']
 };
 if(special[n]) return {id:n,name:special[n][0],desc:special[n][1]};
 if(n>=961&&n<=970) return {id:n,name:'aux_tuning_weight_'+n,desc:'Pomocná ladicí váha '+n};
 return {id:n,name:'ai_weight_'+n,desc:'Aktivní číselná váha '+n};
}

}
export function buildAIWeightReviewQuestions(detail, cursors = {}) {
 const candidates=Array.isArray(detail?.decision?.candidates)?detail.decision.candidates:[];
 const selectedId=Number(detail?.decision?.preferredPieceId ?? detail?.decision?.selectedPieceId);
 const selected=candidates.find(item=>Number(item.pieceId)===selectedId);
 const selectedSignals=selected?.weightFactors?.weightSignals;
 const others=candidates.filter(item=>Number(item.pieceId)!==selectedId).map(item=>item.weightFactors?.weightSignals);
 if(!Array.isArray(selectedSignals)||!others.length) return [];
 const idsByChannel=Array.from({length:10},(_,channel)=>Array.from({length:1000},(_,i)=>i+1).filter(id=>isTrainableAIWeight(id)&&(id-1)%10===channel));
 const questions=[];
 for(let channel=0;channel<10;channel++){
  const values=others.map(signals=>Array.isArray(signals)?Number(signals[channel])||0:null).filter(value=>value!==null);
  if(!values.length) continue;
  const delta=(Number(selectedSignals[channel])||0)-values.reduce((sum,value)=>sum+value,0)/values.length;
  if(!Number.isFinite(delta)||Math.abs(delta)<0.001) continue;
  const ids=idsByChannel[channel]; if(!ids.length) continue;
  const index=Math.abs(Math.trunc(Number(cursors[channel])||0))%ids.length;
  const id=ids[index]; const meta=getAIWeightMetadata(id);
  questions.push({id,name:meta.name,description:meta.desc,channel,channelName:CHANNELS[channel],signalDelta:Number(delta.toFixed(5)),nextCursor:index+1});
 }
 return questions;
}
