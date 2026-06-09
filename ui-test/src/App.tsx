import { useState, useCallback, useRef, useEffect } from 'react';

// ==================== TYPES ====================

interface AppState {
  apiKey: string;
  customerId: string;
  baseUrl: string;
  projectId: string;
  artifactId: string;
  extractedArtifactId: string;
  taskId: string;
  agentRunId: string;
  summaryArtifactId: string;
  dataNeedId: string;
  claimId: string;
  reviewCommentId: string;
  versionId: string;
  regenerationTaskId: string;
  followUpProjectId: string;
  lessonId: string;
  responses: Record<string, any>;
}

interface Step {
  name: string;
  method: 'GET' | 'POST';
  getPath: (s: AppState) => string;
  getBody?: (s: AppState) => any;
  requires: (keyof AppState)[];
  extract?: (data: any) => Partial<AppState>;
  description: string;
  special?: 'upload' | 'review' | 'impact' | 'distill' | 'regenerate';
}

// ==================== INITIAL STATE ====================

const initialState: AppState = {
  apiKey: 'dev-api-key',
  customerId: 'ui-test-customer',
  baseUrl: '',
  projectId: '',
  artifactId: '',
  extractedArtifactId: '',
  taskId: '',
  agentRunId: '',
  summaryArtifactId: '',
  dataNeedId: '',
  claimId: '',
  reviewCommentId: '',
  versionId: '',
  regenerationTaskId: '',
  followUpProjectId: '',
  lessonId: '',
  responses: {},
};

// ==================== STEP DEFINITIONS ====================

const SLICES: { name: string; steps: Step[] }[] = [
  {
    name: 'Slice 1: Ingest a Deal',
    steps: [
      {
        name: '1. Create Project',
        method: 'POST',
        getPath: () => '/projects',
        getBody: () => ({
          name: 'AcmeCorp Acquisition',
          target_company: 'AcmeCorp',
          confidentiality_class: 'confidential',
          description: 'Created from test UI',
        }),
        requires: [],
        extract: (d) => (d.id ? { projectId: d.id } : {}),
        description: 'Creates a new project. Auto-creates workspace v1.',
      },
      {
        name: '2. Get Project Details',
        method: 'GET',
        getPath: (s) => `/projects/${s.projectId}`,
        requires: ['projectId'],
        extract: (d) => {
          const v = d.workspace_versions?.[0];
          return v?.id ? { versionId: v.id } : {};
        },
        description: 'Fetches project to get the current workspace version ID.',
      },
      {
        name: '3. Upload PDF',
        method: 'POST',
        getPath: (s) => `/projects/${s.projectId}/upload`,
        requires: ['projectId'],
        extract: (d) => (d.artifact?.id ? { artifactId: d.artifact.id } : {}),
        description: 'Upload a test PDF. Auto-triggers ingestion pipeline.',
        special: 'upload',
      },
      {
        name: '4. List Artifacts',
        method: 'GET',
        getPath: (s) => `/projects/${s.projectId}/artifacts`,
        requires: ['projectId'],
        extract: (d) => {
          const extracted = d.artifacts?.find((a: any) => a.type === 'extracted_text');
          return extracted?.id ? { extractedArtifactId: extracted.id } : {};
        },
        description: 'Lists all artifacts in the current workspace version.',
      },
      {
        name: '5. View Artifact',
        method: 'GET',
        getPath: (s) => `/artifacts/${s.extractedArtifactId}`,
        requires: ['extractedArtifactId'],
        description: 'Views the extracted text artifact metadata.',
      },
      {
        name: '6. Download Raw Content',
        method: 'GET',
        getPath: (s) => `/artifacts/${s.artifactId}/content`,
        requires: ['artifactId'],
        description: 'Downloads the raw uploaded PDF content (binary).',
      },
    ],
  },
  {
    name: 'Slice 2: Generate First Draft',
    steps: [
      {
        name: '1. Create Research Task',
        method: 'POST',
        getPath: (s) => `/projects/${s.projectId}/tasks`,
        getBody: (s) => ({
          type: 'research',
          capability: 'research',
          payload: { artifact_id: s.extractedArtifactId },
        }),
        requires: ['projectId', 'extractedArtifactId'],
        extract: (d) => (d.id ? { taskId: d.id } : {}),
        description: 'Creates a research task referencing the extracted artifact.',
      },
      {
        name: '2. Claim Task',
        method: 'POST',
        getPath: (s) => `/tasks/${s.taskId}/claim`,
        getBody: () => ({ claimed_by: 'ui-test-agent' }),
        requires: ['taskId'],
        extract: (d) => (d.agent_run?.id ? { agentRunId: d.agent_run.id } : {}),
        description: 'Claims the pending task and creates an agent run.',
      },
      {
        name: '3. Execute Research',
        method: 'POST',
        getPath: (s) => `/tasks/${s.taskId}/execute-research`,
        requires: ['taskId'],
        extract: (d) => (d.artifact_id ? { summaryArtifactId: d.artifact_id } : {}),
        description: 'Runs the research agent and produces a summary artifact.',
      },
      {
        name: '4. View Summary',
        method: 'GET',
        getPath: (s) => `/artifacts/${s.summaryArtifactId}`,
        requires: ['summaryArtifactId'],
        description: 'Views the generated research summary artifact.',
      },
    ],
  },
  {
    name: 'Slice 3: Track Data Needs',
    steps: [
      {
        name: '1. List Data Needs',
        method: 'GET',
        getPath: (s) => `/projects/${s.projectId}/dataneeds`,
        requires: ['projectId'],
        extract: (d) => {
          const first = d.data_needs?.[0];
          return first?.id ? { dataNeedId: first.id } : {};
        },
        description: 'Lists all data needs raised by the research agent.',
      },
      {
        name: '2. Resolve Data Need',
        method: 'POST',
        getPath: (s) => `/dataneeds/${s.dataNeedId}/resolve`,
        getBody: () => ({ notes: 'Resolved via test UI' }),
        requires: ['dataNeedId'],
        description: 'Marks a data need as resolved with notes.',
      },
    ],
  },
  {
    name: 'Slice 4: Govern Material Claims',
    steps: [
      {
        name: '1. Extract Claims',
        method: 'POST',
        getPath: (s) => `/artifacts/${s.summaryArtifactId}/extract-claims`,
        requires: ['summaryArtifactId'],
        description: 'Extracts typed claims from the research summary.',
      },
      {
        name: '2. List Claims',
        method: 'GET',
        getPath: (s) => `/projects/${s.projectId}/claims`,
        requires: ['projectId'],
        extract: (d) => {
          const first = d.claims?.[0];
          return first?.id ? { claimId: first.id } : {};
        },
        description: 'Lists all claims for the project with evidence.',
      },
      {
        name: '3. View Claim',
        method: 'GET',
        getPath: (s) => `/claims/${s.claimId}`,
        requires: ['claimId'],
        description: 'Views a single claim with full evidence.',
      },
    ],
  },
  {
    name: 'Slice 5: Verify Claims',
    steps: [
      {
        name: '1. Verify Claims',
        method: 'POST',
        getPath: (s) => `/projects/${s.projectId}/verify-claims`,
        requires: ['projectId'],
        description: 'Runs the verifier agent on all claims.',
      },
    ],
  },
  {
    name: 'Slice 6: Apply Corrections',
    steps: [
      {
        name: '1. Submit Review',
        method: 'POST',
        getPath: (s) => `/projects/${s.projectId}/reviews`,
        getBody: (s) => ({
          workspace_version_id: s.versionId,
          type: 'correction',
          text: 'Correction: Revenue is $50M, not $30M',
          target_claim_id: s.claimId,
        }),
        requires: ['projectId', 'versionId', 'claimId'],
        extract: (d) => (d.id ? { reviewCommentId: d.id } : {}),
        description: 'Submits a correction review comment.',
        special: 'review',
      },
      {
        name: '2. Create Version v2',
        method: 'POST',
        getPath: (s) => `/projects/${s.projectId}/workspace-versions`,
        getBody: (s) => ({ parent_version_id: s.versionId }),
        requires: ['projectId', 'versionId'],
        extract: (d) => (d.id ? { versionId: d.id } : {}),
        description: 'Creates an immutable workspace version v2 from v1.',
      },
      {
        name: '3. Regenerate',
        method: 'POST',
        getPath: (s) => `/projects/${s.projectId}/regenerate`,
        getBody: (s) => ({
          version_id: s.versionId,
          section_names: ['executive_summary'],
          review_comment_id: s.reviewCommentId,
        }),
        requires: ['projectId', 'versionId', 'reviewCommentId'],
        extract: (d) => (d.id ? { regenerationTaskId: d.id } : {}),
        description: 'Creates a targeted regeneration task for affected sections.',
        special: 'regenerate',
      },
    ],
  },
  {
    name: 'Slice 7: Suggest Impact & Regenerate',
    steps: [
      {
        name: '1. Get Impact',
        method: 'GET',
        getPath: (s) => `/projects/${s.projectId}/reviews/${s.reviewCommentId}/impact`,
        requires: ['projectId', 'reviewCommentId'],
        description: 'Analyzes which claims and sections are affected by the correction.',
      },
      {
        name: '2. Confirm Impact',
        method: 'POST',
        getPath: (s) => `/projects/${s.projectId}/reviews/${s.reviewCommentId}/confirm-impact`,
        requires: ['projectId', 'reviewCommentId'],
        description: 'Confirms affected sections and triggers auto-regeneration.',
        special: 'impact',
      },
    ],
  },
  {
    name: 'Slice 8: Finalize & Export',
    steps: [
      {
        name: '1. Finalize Project',
        method: 'POST',
        getPath: (s) => `/projects/${s.projectId}/finalize`,
        requires: ['projectId'],
        description: 'Runs completion checks and creates the final report.',
      },
    ],
  },
  {
    name: 'Slice 9: Longitudinal Dossiers',
    steps: [
      {
        name: '1. Create Follow-up Project',
        method: 'POST',
        getPath: () => '/projects',
        getBody: (s) => ({
          name: 'AcmeCorp 6-Month Follow-up',
          target_company: 'AcmeCorp',
          confidentiality_class: 'confidential',
          parent_project_id: s.projectId,
        }),
        requires: ['projectId'],
        extract: (d) => (d.id ? { followUpProjectId: d.id } : {}),
        description: 'Creates a linked follow-up project inheriting the dossier.',
      },
      {
        name: '2. List Linked Projects',
        method: 'GET',
        getPath: (s) => `/projects/${s.followUpProjectId}/linked`,
        requires: ['followUpProjectId'],
        description: 'Lists all prior projects in the same dossier.',
      },
      {
        name: '3. View Dossier Claims',
        method: 'GET',
        getPath: (s) => `/projects/${s.followUpProjectId}/dossier`,
        requires: ['followUpProjectId'],
        description: 'Queries all historical claims across the dossier.',
      },
    ],
  },
  {
    name: 'Slice 10: Deletion & Expertise',
    steps: [
      {
        name: '1. Closeout (Body Purge)',
        method: 'POST',
        getPath: (s) => `/projects/${s.projectId}/closeout`,
        requires: ['projectId'],
        description: 'Standard closeout: purges raw files, keeps Juice. Status → archived.',
      },
      {
        name: '2. Redact Confidential',
        method: 'POST',
        getPath: (s) => `/projects/${s.projectId}/redact`,
        requires: ['projectId'],
        description: 'Deletes company-specific claims, keeps market/process knowledge.',
      },
      {
        name: '3. Full Purge',
        method: 'POST',
        getPath: (s) => `/projects/${s.projectId}/purge`,
        requires: ['projectId'],
        description: 'Deletes all project data from DB and object storage.',
      },
      {
        name: '4. Distill Expertise',
        method: 'POST',
        getPath: (s) => `/projects/${s.projectId}/distill`,
        requires: ['projectId'],
        extract: (d) => (d.lessons?.[0]?.id ? { lessonId: d.lessons[0].id } : {}),
        description: 'Extracts candidate lessons from the project.',
        special: 'distill',
      },
      {
        name: '5. Approve Lesson',
        method: 'POST',
        getPath: (s) => `/expertise/${s.lessonId}/approve`,
        requires: ['lessonId'],
        description: 'Human approval gate: lesson enters expertise store.',
      },
      {
        name: '6. List Expertise',
        method: 'GET',
        getPath: () => '/expertise?status=approved',
        requires: [],
        description: 'Queries all approved expertise lessons.',
      },
    ],
  },
];

// ==================== APP COMPONENT ====================

export default function App() {
  const [state, setState] = useState<AppState>(initialState);
  const [activeSlice, setActiveSlice] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [currentResponse, setCurrentResponse] = useState<any>(null);
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<{ name: string; content: string } | null>(null);
  const [reviewText, setReviewText] = useState('Correction: Revenue is $50M, not $30M');
  const [regenSections, setRegenSections] = useState('executive_summary');
  const [distillLessons, setDistillLessons] = useState([
    { title: 'For SaaS, check GRR and NRR', content: 'Always verify gross and net retention rates separately', category: 'checklist' },
    { title: 'Check revenue concentration early', content: 'Top 5 customer concentration should be reviewed in the first week', category: 'methodology' },
  ]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const addLog = useCallback((msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  const arePrerequisitesMet = (step: Step) => {
    return step.requires.every((key) => {
      const value = state[key as keyof AppState];
      return typeof value === 'string' && value.length > 0;
    });
  };

  const executeStep = async (sliceIndex: number, stepIndex: number) => {
    const slice = SLICES[sliceIndex];
    const step = slice.steps[stepIndex];
    const stepKey = `${sliceIndex}-${stepIndex}`;

    setLoading(stepKey);
    setCurrentResponse(null);
    setCurrentError(null);

    try {
      if (step.special === 'upload' && !selectedFile) {
        throw new Error('Please select a PDF file first');
      }

      const path = step.getPath(state);
      const url = state.baseUrl ? `${state.baseUrl}${path}` : path;

      let body: any = undefined;
      if (step.getBody) {
        body = step.getBody(state);
      }

      if (step.special === 'upload' && selectedFile) {
        body = {
          file_name: selectedFile.name,
          mime_type: 'application/pdf',
          file_content: selectedFile.content,
        };
      } else if (step.special === 'review') {
        body = { ...body, text: reviewText };
      } else if (step.special === 'regenerate') {
        body = { ...body, section_names: regenSections.split(',').map((s) => s.trim()).filter(Boolean) };
      } else if (step.special === 'impact') {
        const impactRes = state.responses['6-0'];
        const sections = impactRes?.suggested_sections || ['executive_summary'];
        body = { confirmed_sections: sections.length > 0 ? sections : ['executive_summary'] };
      } else if (step.special === 'distill') {
        body = { lessons: distillLessons };
      }

      const res = await fetch(url, {
        method: step.method,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': state.apiKey,
          'x-customer-id': state.customerId,
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      let data: any;
      const contentType = res.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        data = await res.json();
      } else {
        data = { _binary: true, status: res.status, statusText: res.statusText };
      }

      if (!res.ok) {
        throw new Error(data.error?.message || data.message || `HTTP ${res.status}`);
      }

      const updates: Record<string, any> = {};
      if (step.extract) {
        const extracted = step.extract(data);
        Object.entries(extracted).forEach(([k, v]) => {
          if (v !== undefined && v !== null && v !== '') {
            updates[k] = v;
          }
        });
      }

      setState((prev) => ({
        ...prev,
        ...updates,
        responses: {
          ...prev.responses,
          [`${sliceIndex}-${stepIndex}`]: data,
        },
      }));

      setCompletedSteps((prev) => new Set([...prev, stepKey]));
      setCurrentResponse(data);
      addLog(`✅ ${slice.name} > ${step.name}: Success (${res.status})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setCurrentError(msg);
      addLog(`❌ ${slice.name} > ${step.name}: ${msg}`);
    } finally {
      setLoading(null);
    }
  };

  const resetState = () => {
    setState(initialState);
    setCompletedSteps(new Set());
    setCurrentResponse(null);
    setCurrentError(null);
    setLogs([]);
    setSelectedFile(null);
    setReviewText('Correction: Revenue is $50M, not $30M');
    setRegenSections('executive_summary');
    setDistillLessons([
      { title: 'For SaaS, check GRR and NRR', content: 'Always verify gross and net retention rates separately', category: 'checklist' },
      { title: 'Check revenue concentration early', content: 'Top 5 customer concentration should be reviewed in the first week', category: 'methodology' },
    ]);
    setActiveSlice(0);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      setSelectedFile({ name: file.name, content: base64 });
    };
    reader.readAsDataURL(file);
  };

  const renderStepCard = (sliceIndex: number, stepIndex: number) => {
    const slice = SLICES[sliceIndex];
    const step = slice.steps[stepIndex];
    const stepKey = `${sliceIndex}-${stepIndex}`;
    const isCompleted = completedSteps.has(stepKey);
    const isLoading = loading === stepKey;
    const prerequisitesMet = arePrerequisitesMet(step);

    return (
      <div key={stepKey} className="bg-gray-800 rounded-lg p-4 mb-3 border border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold ${
                isCompleted
                  ? 'bg-green-600 text-white'
                  : prerequisitesMet
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-600 text-gray-300'
              }`}
            >
              {isCompleted ? '✓' : stepIndex + 1}
            </span>
            <span className="font-semibold text-white">{step.name}</span>
          </div>
          <span className="text-xs font-mono text-gray-400">
            {step.method} {step.getPath(state)}
          </span>
        </div>
        <p className="text-sm text-gray-400 mb-3">{step.description}</p>

        {/* Special UI elements */}
        {step.special === 'upload' && (
          <div className="mb-3">
            <input
              type="file"
              accept="application/pdf"
              onChange={handleFileSelect}
              className="text-sm text-gray-300 block w-full"
            />
            {selectedFile && (
              <p className="text-xs text-green-400 mt-1">Selected: {selectedFile.name}</p>
            )}
          </div>
        )}
        {step.special === 'review' && (
          <div className="mb-3">
            <textarea
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-sm text-white"
              rows={2}
            />
          </div>
        )}
        {step.special === 'regenerate' && (
          <div className="mb-3">
            <input
              type="text"
              value={regenSections}
              onChange={(e) => setRegenSections(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-sm text-white"
              placeholder="Comma-separated section names"
            />
          </div>
        )}
        {step.special === 'impact' && (
          <div className="mb-3">
            {(() => {
              const res = state.responses['6-0'];
              if (!res) {
                return (
                  <p className="text-xs text-yellow-400">
                    ⚠️ Run "Get Impact" first for accurate sections. Will default to ['executive_summary'].
                  </p>
                );
              }
              return (
                <p className="text-xs text-green-300">
                  Using suggested sections: {res.suggested_sections?.join(', ')}
                </p>
              );
            })()}
          </div>
        )}
        {step.special === 'distill' && (
          <div className="mb-3 space-y-2">
            {distillLessons.map((lesson, i) => (
              <div key={i} className="bg-gray-900 rounded p-2 border border-gray-700">
                <input
                  type="text"
                  value={lesson.title}
                  onChange={(e) => {
                    const updated = [...distillLessons];
                    updated[i] = { ...updated[i], title: e.target.value };
                    setDistillLessons(updated);
                  }}
                  className="w-full bg-gray-800 border border-gray-600 rounded p-1 text-sm text-white mb-1"
                  placeholder="Title"
                />
                <textarea
                  value={lesson.content}
                  onChange={(e) => {
                    const updated = [...distillLessons];
                    updated[i] = { ...updated[i], content: e.target.value };
                    setDistillLessons(updated);
                  }}
                  className="w-full bg-gray-800 border border-gray-600 rounded p-1 text-sm text-white mb-1"
                  rows={2}
                  placeholder="Content"
                />
                <input
                  type="text"
                  value={lesson.category}
                  onChange={(e) => {
                    const updated = [...distillLessons];
                    updated[i] = { ...updated[i], category: e.target.value };
                    setDistillLessons(updated);
                  }}
                  className="w-full bg-gray-800 border border-gray-600 rounded p-1 text-sm text-white"
                  placeholder="Category"
                />
              </div>
            ))}
          </div>
        )}

        {/* Prerequisites warning */}
        {!prerequisitesMet && (
          <div className="text-xs text-yellow-400 mb-2">Needs: {step.requires.join(', ')}</div>
        )}

        <button
          onClick={() => executeStep(sliceIndex, stepIndex)}
          disabled={!prerequisitesMet || isLoading}
          className={`px-4 py-2 rounded text-sm font-medium ${
            prerequisitesMet && !isLoading
              ? 'bg-blue-600 hover:bg-blue-500 text-white'
              : 'bg-gray-700 text-gray-400 cursor-not-allowed'
          }`}
        >
          {isLoading ? 'Executing...' : isCompleted ? 'Re-run' : 'Execute'}
        </button>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-xl font-bold text-white">NbeamNG Test UI</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(state, null, 2));
                addLog('📋 State copied to clipboard');
              }}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm text-white"
            >
              Copy State
            </button>
            <button
              onClick={resetState}
              className="px-3 py-1 bg-red-700 hover:bg-red-600 rounded text-sm text-white"
            >
              Reset State
            </button>
          </div>
        </div>
      </header>

      {/* Config Bar */}
      <div className="bg-gray-800 border-b border-gray-700 p-4">
        <div className="max-w-7xl mx-auto flex flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400">API Key</label>
            <input
              type="text"
              value={state.apiKey}
              onChange={(e) =>
                setState((prev) => ({ ...prev, apiKey: e.target.value }))
              }
              className="bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm text-white w-40"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400">Customer ID</label>
            <input
              type="text"
              value={state.customerId}
              onChange={(e) =>
                setState((prev) => ({ ...prev, customerId: e.target.value }))
              }
              className="bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm text-white w-40"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400">Base URL</label>
            <input
              type="text"
              value={state.baseUrl}
              onChange={(e) =>
                setState((prev) => ({ ...prev, baseUrl: e.target.value }))
              }
              className="bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm text-white w-64"
              placeholder="http://localhost:3000 or empty for proxy"
            />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto flex flex-col md:flex-row">
        {/* Sidebar */}
        <aside className="w-full md:w-64 bg-gray-800 border-b md:border-b-0 md:border-r border-gray-700 min-h-screen p-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase mb-3">Slices</h2>
          <nav className="space-y-1">
            {SLICES.map((slice, i) => (
              <button
                key={i}
                onClick={() => setActiveSlice(i)}
                className={`w-full text-left px-3 py-2 rounded text-sm ${
                  activeSlice === i
                    ? 'bg-blue-700 text-white'
                    : 'text-gray-300 hover:bg-gray-700'
                }`}
              >
                <span className="font-medium">{i + 1}.</span> {slice.name}
              </button>
            ))}
          </nav>

          {/* State Panel */}
          <div className="mt-6">
            <h2 className="text-sm font-semibold text-gray-400 uppercase mb-3">Captured State</h2>
            <div className="space-y-1 text-xs font-mono">
              {Object.entries(state)
                .filter(([k]) => k !== 'responses')
                .map(([key, value]) => (
                  <div
                    key={key}
                    className={`px-2 py-1 rounded ${
                      value ? 'bg-green-900/30 text-green-300' : 'bg-gray-800 text-gray-500'
                    }`}
                  >
                    <span className="text-gray-400">{key}:</span>{' '}
                    <span className="truncate block">{(value as string) || '—'}</span>
                  </div>
                ))}
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-white">{SLICES[activeSlice].name}</h2>
            <p className="text-sm text-gray-400">
              {
                SLICES[activeSlice].steps.filter((_, i) =>
                  completedSteps.has(`${activeSlice}-${i}`)
                ).length
              }{' '}
              / {SLICES[activeSlice].steps.length} steps completed
            </p>
          </div>

          {/* Steps */}
          <div className="space-y-3">
            {SLICES[activeSlice].steps.map((_, i) => renderStepCard(activeSlice, i))}
          </div>

          {/* Response Panel */}
          {(currentResponse || currentError) && (
            <div className="mt-6 bg-gray-800 rounded-lg border border-gray-700 p-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-2">
                {currentError ? 'Error' : 'Last Response'}
              </h3>
              {currentError ? (
                <pre className="bg-red-900/20 border border-red-700 rounded p-3 text-sm text-red-300 overflow-auto max-h-64">
                  {currentError}
                </pre>
              ) : (
                <pre className="bg-gray-900 border border-gray-700 rounded p-3 text-sm text-green-300 overflow-auto max-h-96">
                  {JSON.stringify(currentResponse, null, 2)}
                </pre>
              )}
            </div>
          )}

          {/* Logs */}
          <div className="mt-6 bg-gray-800 rounded-lg border border-gray-700 p-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-2">Execution Log</h3>
            <div className="bg-gray-900 rounded p-3 h-48 overflow-auto text-xs font-mono space-y-1">
              {logs.length === 0 && (
                <span className="text-gray-500">No actions yet...</span>
              )}
              {logs.map((log, i) => (
                <div
                  key={i}
                  className={
                    log.startsWith('✅')
                      ? 'text-green-400'
                      : log.startsWith('❌')
                      ? 'text-red-400'
                      : log.startsWith('📋')
                      ? 'text-blue-400'
                      : 'text-gray-400'
                  }
                >
                  {log}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
