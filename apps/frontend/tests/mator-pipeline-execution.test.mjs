import { test, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MatorPipelineExecution } from '../components/mator/chat/mator-pipeline-execution.tsx';

const base = {
  workflowId: 'profile', workflowRevision: 2, sourceDigest: 'digest',
  pipelines: [{
    id:'inspection',title:'Actual pinned inspection',runId:'run-123',
    state:'approval-needed',completed:1,total:2,historyIncomplete:false,unattributedCount:0,
    tasks:[
      {id:'start',title:'Establish session',kind:'session',state:'completed',events:[],screenshots:[]},
      {id:'review',title:'Review evidence',kind:'approve',state:'approval-needed',
        events:[],screenshots:[],checkpointId:'checkpoint-123'},
    ],
  }],
};

test('renders pinned pipeline hierarchy without fabricating successful tasks', () => {
  const html = renderToStaticMarkup(createElement(MatorPipelineExecution,{execution:base}));
  expect(html).toContain('Actual pinned inspection');
  expect(html).toContain('Establish session');
  expect(html).toContain('Review evidence');
  expect(html).toContain('1/2 recorded');
  expect(html).toContain('separate from saved conversation history');
  expect(html).not.toContain('>Approve</button>');
});

test('only a real checkpoint with an authorized callback exposes actions', () => {
  const html = renderToStaticMarkup(createElement(MatorPipelineExecution,{
    execution:base,onDecision:async()=>{},
  }));
  expect(html).toContain('>Approve</button>');
  expect(html).toContain('>Reject</button>');
  const noCheckpoint = JSON.parse(JSON.stringify(base));
  delete noCheckpoint.pipelines[0].tasks[1].checkpointId;
  const noHtml = renderToStaticMarkup(createElement(MatorPipelineExecution,{
    execution:noCheckpoint,onDecision:async()=>{},
  }));
  expect(noHtml).not.toContain('>Approve</button>');
});
