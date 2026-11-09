// /scripts/ai-train-weights.mjs
#!/usr/bin/env node
/**
 * Reward-based REINFORCE trainer for exactly ten named strategic weights.
 * Training examples are grouped and split by completed game, never by decision.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const args = Object.fromEntries(process.argv.slice(2).map(value => {
    const match = value.match(/^--([^=]+)=(.*)$/);
    return match ? [match[1], match[2]] : [value.replace(/^--/, ''), true];
}));
const inputDir = path.resolve(String(args['input-dir'] || 'training-data/self-play'));
const currentWeightsPath = path.resolve(String(args['current-weights'] || 'config/ai-tactical-weights.json'));
const outputWeightsPath = path.resolve(String(args['output-weights'] || 'artifacts/ai-tactical-weights-candidate.json'));
const modulePath = path.resolve(String(args.module || 'artifacts/ai-tactical-weights-candidate.js'));
const reportPath = path.resolve(String(args.report || 'artifacts/ai-weight-training-report.json'));
const epochs = Math.max(1, Math.min(200, Number(args.epochs) || 30));
const minGames = Math.max(4, Number(args['min-games']) || 10);
const minRecords = Math.max(20, Number(args['min-records']) || 100);
const learningRate = Math.max(0.0001, Math.min(0.1, Number(args['learning-rate']) || 0.05));
const KEYS = ['progressToGoal','finishPiece','captureOpponent','protectOwn','threatenOpponent','deployPiece','homeProgress','bonusContinuation','startFieldRisk','flexibility'];
const DEFAULTS = {progressToGoal:2,finishPiece:80,captureOpponent:18,protectOwn:25,threatenOpponent:12,deployPiece:8,homeProgress:20,bonusContinuation:10,startFieldRisk:18,flexibility:4};
const BOUNDS = {progressToGoal:[0,20],finishPiece:[0,300],captureOpponent:[0,100],protectOwn:[0,100],threatenOpponent:[0,100],deployPiece:[0,80],homeProgress:[0,120],bonusContinuation:[0,80],startFieldRisk:[0,120],flexibility:[0,40]};
function readJson(file,fallback=null){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(error){if(error.code==='ENOENT')return fallback;throw error;}}
function listFiles(dir){if(!fs.existsSync(dir))return[];return fs.readdirSync(dir).filter(name=>/\.jsonl(?:\.gz)?$/i.test(name)).map(name=>path.join(dir,name)).sort();}
function readRecords(file){const raw=fs.readFileSync(file);const body=file.endsWith('.gz')?zlib.gunzipSync(raw).toString('utf8'):raw.toString('utf8');return body.split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));}
function hash(value){let h=2166136261;for(const char of String(value))h=Math.imul(h^char.charCodeAt(0),16777619);return h>>>0;}
function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
function features(candidate){const values=candidate.teacherFactors?.weightSignals;return Array.isArray(values)&&values.length===KEYS.length&&values.every(value=>Number.isFinite(Number(value)))?values.map(Number):null;}
function vectorScore(weights,vector){return KEYS.reduce((sum,key,index)=>sum+Number(weights[key])*vector[index],0);}
function softmax(scores){const max=Math.max(...scores);const values=scores.map(value=>Math.exp(clamp(value-max,-40,40)));const total=values.reduce((a,b)=>a+b,0);return values.map(value=>value/total);}
function policyLogLikelihood(records,weights){let total=0,count=0;for(const record of records){const index=record.candidates.findIndex(item=>item.pieceId===record.selectedPieceId);if(index<0)continue;const vectors=record.candidates.map(features);const probs=softmax(vectors.map(vector=>vectorScore(weights,vector)/record.policyTemperature));const ratio=clamp(probs[index]/record.selectedProbability,0.2,5);total+=(record.advantage||0)*ratio*Math.log(Math.max(1e-12,probs[index]));count++;}return count?total/count:0;}

const config=readJson(currentWeightsPath,{weights:DEFAULTS});
const previousWeights={...DEFAULTS,...(config.weights||{})};
for(const key of KEYS)if(!Number.isFinite(Number(previousWeights[key])))throw new Error('Neplatná aktivní váha: '+key);
const files=listFiles(inputDir);
if(!files.length)throw new Error('Nebyly nalezeny self-play JSONL soubory: '+inputDir);
const games=new Map();
const stats={files:files.length,records:0,incompleteSkipped:0,malformedSkipped:0,nonExploratorySkipped:0,behaviorPolicyMismatchSkipped:0};
for(const file of files)for(const record of readRecords(file)){
    stats.records++;
    if(record.completed!==true||!Number.isFinite(record.reward)||!Array.isArray(record.candidates)){stats.incompleteSkipped++;continue;}
    const gameId=String(record.gameId||'');if(!gameId){stats.malformedSkipped++;continue;}
    if(record.selection!=='reinforce-softmax'||!Number.isFinite(record.policyTemperature)||record.policyTemperature<0.25||!Number.isFinite(record.selectedProbability)||record.selectedProbability<=0){stats.nonExploratorySkipped++;continue;}
    if(record.candidates.length<2||record.candidates.some(item=>item.teacherFactors?.winning)){stats.nonExploratorySkipped++;continue;}
    const vectors=record.candidates.map(features);
    if(vectors.some(vector=>!vector)){stats.malformedSkipped++;continue;}
    const behaviorWeights=record.behaviorWeights;
    if(!behaviorWeights||KEYS.some(key=>!Number.isFinite(Number(behaviorWeights[key])))){stats.malformedSkipped++;continue;}
    const scores=record.candidates.map((item,index)=>Number(item.teacherScore));
    if(scores.some((score,index)=>!Number.isFinite(score)||Math.abs(score-vectorScore(behaviorWeights,vectors[index]))>0.0001)){stats.behaviorPolicyMismatchSkipped++;continue;}
    const probabilities=softmax(scores.map(score=>score/record.policyTemperature));
    const selectedIndex=record.candidates.findIndex(item=>item.pieceId===record.selectedPieceId);
    if(selectedIndex<0||Math.abs(probabilities[selectedIndex]-record.selectedProbability)>0.0001){stats.behaviorPolicyMismatchSkipped++;continue;}
    if(!games.has(gameId))games.set(gameId,[]);
    games.get(gameId).push({...record});
}
if(games.size<minGames)throw new Error('Nedostatek dokončených partií: '+games.size+'; potřeba alespoň '+minGames+'.');
const trainingGames=new Set(),validationGames=new Set();
for(const gameId of games.keys())(hash(gameId)%5===0?validationGames:trainingGames).add(gameId);
if(trainingGames.size<2||validationGames.size<2)throw new Error('Nelze rozdělit celé partie na trénink a validaci.');
function prepare(set){const result=[];for(const id of set){const records=games.get(id);const rewards=new Map();for(const r of records)rewards.set(r.playerId,r.reward);const mean=[...rewards.values()].reduce((a,b)=>a+b,0)/Math.max(1,rewards.size);for(const r of records){r.advantage=clamp(r.reward-mean,-1.5,1.5);if(Math.abs(r.advantage)>1e-9)result.push(r);}}return result;}
const training=prepare(trainingGames),validation=prepare(validationGames);
if(training.length<minRecords||validation.length<Math.max(10,Math.floor(minRecords/5)))throw new Error('Nedostatek rozhodnutí: train='+training.length+', validation='+validation.length);
let candidate={...previousWeights};
const baselineValidation=policyLogLikelihood(validation,candidate);
for(let epoch=0;epoch<epochs;epoch++){
    const gradient=Object.fromEntries(KEYS.map(key=>[key,0]));let used=0;
    for(const record of training){
        const vectors=record.candidates.map(features);const selected=record.candidates.findIndex(item=>item.pieceId===record.selectedPieceId);if(selected<0)continue;
        const probs=softmax(vectors.map(vector=>vectorScore(candidate,vector)/record.policyTemperature));
        const ratio=clamp(probs[selected]/record.selectedProbability,0.2,5);
        for(let k=0;k<KEYS.length;k++){const expected=vectors.reduce((sum,vector,index)=>sum+probs[index]*vector[k],0);gradient[KEYS[k]]+=record.advantage*ratio*(vectors[selected][k]-expected)/record.policyTemperature;}
        used++;
    }
    if(!used)throw new Error('Trénink nemá použitelná rozhodnutí.');
    for(const key of KEYS){const [min,max]=BOUNDS[key];candidate[key]=clamp(candidate[key]+learningRate*clamp(gradient[key]/used,-0.25,0.25),min,max);}
}
const candidateValidation=policyLogLikelihood(validation,candidate);
const improvement=candidateValidation-baselineValidation;
const accepted=Number.isFinite(candidateValidation)&&improvement>1e-7;
const finalWeights=accepted?candidate:previousWeights;
const report={format:'clovece-ai-ten-weight-training-report',formatVersion:2,createdAt:new Date().toISOString(),
    method:'REINFORCE over ten named strategic signals using completed-game placement rewards',
    source:{...stats,completedGames:games.size,trainingGames:trainingGames.size,validationGames:validationGames.size},
    decisions:{training:training.length,validation:validation.length},epochs,learningRate,previousWeights,candidateWeights:candidate,finalWeights,
    validation:{baselineRewardWeightedLogLikelihood:Number(baselineValidation.toFixed(8)),candidateRewardWeightedLogLikelihood:Number(candidateValidation.toFixed(8)),improvement:Number(improvement.toFixed(8))},
    accepted,safeguards:{exactlyTenTrainableWeights:true,immediateWinPriorityFixedInStrategy:true,legalMovesAndRulesUntouched:true,splitByWholeGame:true,rejectedUnlessValidationImproves:true,behaviorPolicyVerified:true,importanceRatioClipped:[0.2,5]}};
fs.mkdirSync(path.dirname(reportPath),{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
if(accepted){const output={version:2,candidateCreatedAt:report.createdAt,trainingMethod:report.method,sourceGames:games.size,basedOnWeights:previousWeights,weights:finalWeights};
fs.mkdirSync(path.dirname(outputWeightsPath),{recursive:true});fs.writeFileSync(outputWeightsPath,JSON.stringify(output,null,2)+'\n');
fs.mkdirSync(path.dirname(modulePath),{recursive:true});fs.writeFileSync(modulePath,'// Candidate generated from completed-game reward training.\nexport const AI_TACTICAL_WEIGHTS = Object.freeze('+JSON.stringify(finalWeights,null,2)+');\n');
}else{for(const file of [outputWeightsPath,modulePath])if(fs.existsSync(file))fs.rmSync(file);}
process.stdout.write(JSON.stringify(report,null,2)+'\n');
