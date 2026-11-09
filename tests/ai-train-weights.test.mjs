// /tests/ai-train-weights.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('trenér zpracuje výsledky dokončených partií a pracuje s přesně deseti vahami',()=>{
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'clovece-ten-weight-train-'));
    const input=path.join(directory,'self-play'),weights=path.join(directory,'weights.json');
    const module=path.join(directory,'weights.js'),reportPath=path.join(directory,'report.json');
    fs.mkdirSync(input,{recursive:true});
    try{
        const keys=['progressToGoal','finishPiece','captureOpponent','protectOwn','threatenOpponent','deployPiece','homeProgress','bonusContinuation','startFieldRisk','flexibility'];
        const initial={progressToGoal:2,finishPiece:80,captureOpponent:18,protectOwn:25,threatenOpponent:12,deployPiece:8,homeProgress:20,bonusContinuation:10,startFieldRisk:18,flexibility:4};
        const records=[];
        for(let game=0;game<60;game++)for(let player=0;player<2;player++)for(let turn=0;turn<4;turn++){
            const vectors=[Array(10).fill(0),Array(10).fill(0)];vectors[0][0]=1;vectors[1][0]=0;
            const scores=vectors.map(vector=>keys.reduce((sum,key,index)=>sum+initial[key]*vector[index],0));
            const probs=scores.map(score=>Math.exp(score/4));const total=probs.reduce((a,b)=>a+b,0);
            const selected=player===0?0:1;
            records.push({gameId:'train-'+game,completed:true,playerId:player,reward:player===0?1:-1,selection:'reinforce-softmax',
                policyTemperature:4,behaviorWeights:initial,selectedProbability:probs[selected]/total,selectedPieceId:selected,
                candidates:[0,1].map(index=>({pieceId:index,teacherScore:scores[index],teacherFactors:{weightSignals:vectors[index],winning:false}}))});
        }
        fs.writeFileSync(path.join(input,'games.jsonl'),records.map(item=>JSON.stringify(item)).join('\n')+'\n');
        const result=spawnSync(process.execPath,['scripts/ai-train-weights.mjs','--input-dir='+input,'--output-weights='+weights,'--module='+module,'--report='+reportPath,'--epochs=10','--min-records=20'],{encoding:'utf8',timeout:120000});
        assert.equal(result.status,0,result.stderr||result.stdout);
        const report=JSON.parse(fs.readFileSync(reportPath,'utf8'));
        assert.equal(report.method,'REINFORCE over ten named strategic signals using completed-game placement rewards');
        assert.equal(Object.keys(report.previousWeights).length,10);
        assert.ok(report.source.completedGames>=10);
        assert.ok(report.decisions.training>=20);
        assert.ok(report.decisions.validation>=10);
        assert.equal(report.safeguards.exactlyTenTrainableWeights,true);
        assert.equal(typeof report.accepted,'boolean');
        if(report.accepted){const candidate=JSON.parse(fs.readFileSync(weights,'utf8'));assert.equal(Object.keys(candidate.weights).length,10);}
    }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
