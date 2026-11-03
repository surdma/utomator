import test from 'node:test';
import assert from 'node:assert/strict';
import { beginQuestionFlow, currentQuestion, provideQuestionAnswer, questionFlowSubmission, requiresVisualAnswer, spokenQuestionAnswer } from '../components/mator/mator-call-questions.ts';
const simple=(name,prompt,more={})=>({name,prompt,required:true,multiple:false,choices:[],inputType:'text',...more});

test('multi-question clarification collects answers and posts once at finish', () => {
  let flow=beginQuestionFlow('event-1',[simple('name','What is your name?'),simple('role','What role?')]);
  assert.equal(currentQuestion(flow).name,'name');
  assert.throws(()=>questionFlowSubmission(flow),/not complete/);
  flow=provideQuestionAnswer(flow,['Ada']);
  assert.equal(currentQuestion(flow).name,'role');
  flow=provideQuestionAnswer(flow,['Engineer']);
  assert.equal(currentQuestion(flow),null);
  assert.deepEqual(questionFlowSubmission(flow),{text:'What is your name? Ada\nWhat role? Engineer',attachmentIds:[]});
});
test('structured URL/file/long multiple selections require visual form',()=>{
  assert.equal(requiresVisualAnswer(simple('url','Provide a URL',{inputType:'url'})),true);
  assert.equal(requiresVisualAnswer(simple('file','Attach a file',{inputType:'file'})),true);
  assert.equal(requiresVisualAnswer(simple('tags','Choose tags',{multiple:true})),true);
  assert.equal(requiresVisualAnswer(simple('name','Your name?')),false);
});
test('optional questions can be skipped, required questions cannot',()=>{
  const flow=beginQuestionFlow('event',[simple('required','Name?')]);
  assert.throws(()=>provideQuestionAnswer(flow,[]),/Answer/);
  const skipped=provideQuestionAnswer(beginQuestionFlow('event',[simple('optional','Extra?',{required:false})]),[]);
  assert.match(questionFlowSubmission(skipped).text,/Skipped/);
});
test('spoken choices resolve exact option IDs but no guessed closest match',()=>{
  const q=simple('pick','Which?',{choices:[{label:'Personal',value:'personal'},{label:'Company',value:'company'}]});
  assert.deepEqual(spokenQuestionAnswer(q,'company'),['company']);
  assert.deepEqual(spokenQuestionAnswer(q,'PERSONAL'),['personal']);
  assert.throws(()=>spokenQuestionAnswer(q,'almost company'),/didn't recognize/);
});
test('files and URLs validate and preserve attachments',()=>{
  let f=beginQuestionFlow('event',[simple('link','URL?',{inputType:'url'}),simple('file','Attach',{inputType:'file'})]);
  assert.throws(()=>provideQuestionAnswer(f,['javascript:alert(1)']),/HTTP/);
  f=provideQuestionAnswer(f,['https://example.com/path']);
  assert.throws(()=>provideQuestionAnswer(f,['plan.pdf']),/Upload/);
  f=provideQuestionAnswer(f,['plan.pdf'],['att-1']);
  const sub=questionFlowSubmission(f);
  assert.match(sub.text,/example.com/);
  assert.deepEqual(sub.attachmentIds,['att-1']);
});
test('invalid or duplicate question identity is rejected',()=>{
  assert.throws(()=>beginQuestionFlow('e',[simple('x','A'),simple('x','B')]),/distinct/);
  assert.throws(()=>beginQuestionFlow('',[simple('a','A')]),/distinct/);
});
test('visual choice answers cannot submit values outside the allowed options',()=>{
 const flow=beginQuestionFlow('event',[simple('choice','Choose an option',{choices:[{value:'one',label:'One'}]})]);
 assert.throws(()=>provideQuestionAnswer(flow,['fake']),/listed options/);
});