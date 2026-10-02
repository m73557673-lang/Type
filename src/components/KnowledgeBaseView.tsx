import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Search,
  Upload,
  FileText,
  Layers,
  Database,
  ShieldAlert,
  CheckCircle2,
  ExternalLink,
  Plus,
  X,
  FileCode,
  Tag,
  Clock,
  Sparkles,
  Info
} from 'lucide-react';
import { KnowledgeDocument, DocumentChunk, IndexingStatus, RAGSearchResult } from '../types';
import { api } from '../api';

interface KnowledgeBaseViewProps {
  documents: KnowledgeDocument[];
  onSearch: (query: string) => Promise<any>;
  isLoading: boolean;
}

export const KnowledgeBaseView: React.FC<KnowledgeBaseViewProps> = ({
  documents,
  isLoading
}) => {
  const [activeTab, setActiveTab] = useState<'search' | 'library'>('search');
  const [searchQuery, setSearchQuery] = useState('connection pool exhaustion');
  const [selectedType, setSelectedType] = useState('ALL');
  const [indexingStatus, setIndexingStatus] = useState<IndexingStatus | null>(null);
  const [searchResults, setSearchResults] = useState<DocumentChunk[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<KnowledgeDocument | null>(documents[0] || null);
  const [isSearching, setIsSearching] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Upload Form State
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadType, setUploadType] = useState('RUNBOOK');
  const [uploadSource, setUploadSource] = useState('git://ops-runbooks/services/custom-runbook.md');
  const [uploadContent, setUploadContent] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  // Load indexing status and run initial search
  useEffect(() => {
    loadIndexingStatus();
    executeSearch('connection pool exhaustion');
  }, []);

  useEffect(() => {
    if (documents.length > 0 && !selectedDoc) {
      setSelectedDoc(documents[0]);
    }
  }, [documents, selectedDoc]);

  const loadIndexingStatus = async () => {
    try {
      const status = await api.getIndexingStatus();
      setIndexingStatus(status);
    } catch (err) {
      console.error('Failed to load indexing status:', err);
    }
  };

  const executeSearch = async (queryText: string, typeFilter: string = selectedType) => {
    if (!queryText.trim()) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const res = await api.searchKnowledge(queryText.trim(), 8, typeFilter);
      setSearchResults(res.passages || []);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSearch(searchQuery);
  };

  const handleQuickChip = (text: string) => {
    setSearchQuery(text);
    executeSearch(text);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
    if (!uploadTitle) {
      setUploadTitle(file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '));
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setUploadContent(text || '');
    };
    reader.readAsText(file);
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadTitle.trim() || !uploadContent.trim()) return;

    setIsUploading(true);
    try {
      const res = await api.uploadKnowledgeDocument({
        title: uploadTitle.trim(),
        type: uploadType,
        source: uploadSource.trim(),
        content: uploadContent.trim(),
        filename: uploadedFileName || undefined
      });
      setIndexingStatus(res.indexing_status);
      setIsUploadModalOpen(false);
      setUploadTitle('');
      setUploadContent('');
      setUploadedFileName(null);
      // Trigger search for uploaded topic
      setSearchQuery(uploadTitle);
      executeSearch(uploadTitle);
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* View Header with Indexing Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-lg bg-[#0c1220] border border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-cyan-400" />
            <h2 className="text-base font-semibold text-slate-100">
              Retrieval-Augmented Generation (RAG) Knowledge Layer
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Lexical BM25 chunk retrieval with source attribution, relevance scoring, and strict executable action separation.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-medium text-xs transition shadow-sm"
          >
            <Upload className="w-4 h-4" />
            <span>Upload Document</span>
          </button>
        </div>
      </div>

      {/* Indexing Status Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-lg bg-[#0c1220] border border-slate-800/80 flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase font-mono text-slate-500">Indexed Docs</div>
            <div className="text-lg font-mono font-semibold text-slate-100">
              {indexingStatus?.total_documents ?? documents.length}
            </div>
          </div>
          <FileText className="w-5 h-5 text-cyan-400/70" />
        </div>

        <div className="p-3.5 rounded-lg bg-[#0c1220] border border-slate-800/80 flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase font-mono text-slate-500">Indexed Chunks</div>
            <div className="text-lg font-mono font-semibold text-cyan-400">
              {indexingStatus?.total_chunks ?? 24}
            </div>
          </div>
          <Layers className="w-5 h-5 text-cyan-400/70" />
        </div>

        <div className="p-3.5 rounded-lg bg-[#0c1220] border border-slate-800/80 flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase font-mono text-slate-500">Vocabulary Size</div>
            <div className="text-lg font-mono font-semibold text-slate-100">
              {indexingStatus?.vocabulary_size ?? 380} words
            </div>
          </div>
          <Database className="w-5 h-5 text-purple-400/70" />
        </div>

        <div className="p-3.5 rounded-lg bg-[#0c1220] border border-slate-800/80 flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase font-mono text-slate-500">Retrieval Model</div>
            <div className="text-xs font-mono font-semibold text-emerald-400 flex items-center gap-1.5 mt-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{indexingStatus?.algorithm || 'BM25 (Ranked Lexical)'}</span>
            </div>
          </div>
          <Sparkles className="w-5 h-5 text-emerald-400/70" />
        </div>
      </div>

      {/* Safety Notice Banner */}
      <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-800/40 text-xs text-amber-300 flex items-start gap-2.5">
        <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold uppercase tracking-wider text-[10px] block font-mono text-amber-400">
            Safety Boundary & Executable Separation
          </span>
          <p className="text-[11px] text-amber-200/90 mt-0.5 leading-relaxed">
            Every retrieved passage includes its source attribution, section title, and relevance score. Knowledge documents are read-only operational context and <strong>must never directly authorize executable actions</strong> without explicit human SRE approval.
          </p>
        </div>
      </div>

      {/* Navigation Tabs (Search Passages vs Document Library) */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('search')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition flex items-center gap-2 ${
            activeTab === 'search'
              ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800/60 font-semibold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Search className="w-3.5 h-3.5" />
          <span>BM25 Passage Search ({searchResults.length} matches)</span>
        </button>

        <button
          onClick={() => setActiveTab('library')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition flex items-center gap-2 ${
            activeTab === 'library'
              ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800/60 font-semibold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Operational Document Library ({documents.length} docs)</span>
        </button>
      </div>

      {/* TAB 1: BM25 PASSAGE SEARCH */}
      {activeTab === 'search' && (
        <div className="space-y-4">
          {/* Search Input & Quick Chips */}
          <div className="p-4 rounded-lg bg-[#0c1220] border border-slate-800/80 space-y-3">
            <form onSubmit={handleSearchSubmit} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search operational runbooks, connection pool guides, rollback procedures..."
                  className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-md text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <select
                value={selectedType}
                onChange={(e) => {
                  setSelectedType(e.target.value);
                  executeSearch(searchQuery, e.target.value);
                }}
                className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-md text-xs text-slate-300 font-mono focus:outline-none focus:border-cyan-500"
              >
                <option value="ALL">All Types</option>
                <option value="RUNBOOK">RUNBOOK</option>
                <option value="TROUBLESHOOTING">TROUBLESHOOTING</option>
                <option value="ARCHITECTURE">ARCHITECTURE</option>
                <option value="CHANGE_RECORD">CHANGE_RECORD</option>
                <option value="POSTMORTEM">POSTMORTEM</option>
                <option value="POLICY">POLICY</option>
                <option value="PROCEDURE">PROCEDURE</option>
              </select>

              <button
                type="submit"
                disabled={isSearching}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-medium text-xs rounded-md transition shadow-sm disabled:opacity-50"
              >
                {isSearching ? 'Searching...' : 'Search BM25'}
              </button>
            </form>

            {/* Quick Test Queries */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[10px] font-mono uppercase text-slate-500 mr-1">Quick Queries:</span>
              {[
                'Connection Pool Exhaustion',
                'DB_POOL_SIZE Sizing Formula',
                'Historical Incident INC-873',
                'Standard Rollback Procedure',
                'Incident Severity Matrix'
              ].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleQuickChip(chip)}
                  className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-cyan-300 transition"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          {/* Results List */}
          <div className="space-y-3">
            {isSearching ? (
              <div className="p-12 text-center text-xs text-slate-400 font-mono">
                Evaluating BM25 term frequencies & inverted index...
              </div>
            ) : searchResults.length === 0 ? (
              <div className="p-12 text-center rounded-lg bg-[#0c1220] border border-slate-800/80 space-y-2">
                <Search className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-sm text-slate-300 font-medium">No matching passages found</p>
                <p className="text-xs text-slate-500">Try broadening your search keywords or choosing "All Types".</p>
              </div>
            ) : (
              searchResults.map((chunk, idx) => (
                <div
                  key={chunk.id}
                  className="p-4 rounded-lg bg-[#0c1220] border border-slate-800/80 hover:border-cyan-800/50 transition space-y-2.5"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-semibold text-cyan-400">
                        #{idx + 1} {chunk.document_title}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded text-cyan-300 bg-cyan-950/60 border border-cyan-800/60">
                        {chunk.type}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded text-slate-400 bg-slate-900 border border-slate-800">
                        Section: {chunk.section}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded">
                        BM25 Score: {chunk.score?.toFixed(3)}
                      </span>
                    </div>
                  </div>

                  {/* Passage Content Excerpt */}
                  <div className="p-3 rounded bg-slate-950/80 border border-slate-900 font-mono text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
                    {chunk.content}
                  </div>

                  {/* Footer Attribution & Action Disclaimer */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-800/60 text-[11px] text-slate-500 font-mono">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="text-slate-400">Source:</span>
                      <code className="text-cyan-400/90">{chunk.source}</code>
                      <span>·</span>
                      <span>Chunk ID: {chunk.id}</span>
                    </div>

                    <div className="text-[10px] text-amber-400/80 uppercase font-semibold bg-amber-950/30 px-2 py-0.5 rounded border border-amber-800/30">
                      Passage Only · Non-Executable
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 2: OPERATIONAL DOCUMENT LIBRARY */}
      {activeTab === 'library' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Document List (4 cols) */}
          <div className="lg:col-span-4 space-y-2.5">
            <h3 className="text-xs font-mono uppercase text-slate-400 tracking-wider mb-2">
              Seeded Operational Documents ({documents.length})
            </h3>
            {documents.map((doc) => (
              <div
                key={doc.id}
                onClick={() => setSelectedDoc(doc)}
                className={`p-3.5 rounded-lg border cursor-pointer transition space-y-1.5 ${
                  selectedDoc?.id === doc.id
                    ? 'bg-cyan-950/40 border-cyan-500/70 shadow-sm'
                    : 'bg-[#0c1220] border-slate-800/80 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-slate-500">DOC-{doc.id}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded text-cyan-300 bg-cyan-950/60 border border-cyan-800/60">
                    {doc.type}
                  </span>
                </div>
                <h4 className="text-xs font-semibold text-slate-100">
                  {doc.title}
                </h4>
                <div className="text-[11px] font-mono text-slate-400 truncate">
                  {doc.source}
                </div>
              </div>
            ))}
          </div>

          {/* Document Preview & Chunks (8 cols) */}
          <div className="lg:col-span-8 p-5 rounded-lg bg-[#0c1220] border border-slate-800/80 space-y-4">
            {selectedDoc ? (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800/60">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded text-cyan-300 bg-cyan-950/60 border border-cyan-800/60">
                        {selectedDoc.type}
                      </span>
                      <h3 className="text-sm font-semibold text-slate-100">
                        {selectedDoc.title}
                      </h3>
                    </div>
                    <p className="text-xs text-slate-400 font-mono mt-1">
                      Source: {selectedDoc.source}
                    </p>
                  </div>

                  <span className="text-[11px] font-mono text-slate-400 bg-slate-900 px-2 py-1 rounded border border-slate-800">
                    {selectedDoc.chunks_count || selectedDoc.chunks?.length || 1} Chunks Indexed
                  </span>
                </div>

                {/* Markdown Viewer */}
                <div className="p-4 rounded bg-slate-950 border border-slate-900 text-xs text-slate-300 font-mono leading-relaxed whitespace-pre-wrap max-h-[500px] overflow-y-auto">
                  {selectedDoc.content}
                </div>
              </>
            ) : (
              <div className="p-12 text-center text-xs text-slate-500">
                Select an operational document to inspect its contents.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Upload Operational Document Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#0b101b] border border-slate-800 rounded-lg max-w-xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-cyan-400" />
                <h3 className="text-sm font-semibold text-slate-100">
                  Upload & Index Operational Document
                </h3>
              </div>
              <button
                onClick={() => setIsUploadModalOpen(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Document Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Redis Cache Eviction Runbook"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Document Type</label>
                  <select
                    value={uploadType}
                    onChange={(e) => setUploadType(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded text-slate-100 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="RUNBOOK">RUNBOOK</option>
                    <option value="TROUBLESHOOTING">TROUBLESHOOTING</option>
                    <option value="ARCHITECTURE">ARCHITECTURE</option>
                    <option value="CHANGE_RECORD">CHANGE_RECORD</option>
                    <option value="POSTMORTEM">POSTMORTEM</option>
                    <option value="POLICY">POLICY</option>
                    <option value="PROCEDURE">PROCEDURE</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Source Repository / URI</label>
                  <input
                    type="text"
                    placeholder="git://ops-runbooks/..."
                    value={uploadSource}
                    onChange={(e) => setUploadSource(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              {/* File upload selector */}
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Attach Markdown / Text Document (.md, .txt)
                </label>
                <input
                  type="file"
                  accept=".md,.txt,text/plain,text/markdown"
                  onChange={handleFileUpload}
                  className="w-full text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-cyan-950 file:text-cyan-300 hover:file:bg-cyan-900 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Document Content (Markdown)
                </label>
                <textarea
                  required
                  rows={8}
                  placeholder="# Section 1&#10;Diagnostic instructions..."
                  value={uploadContent}
                  onChange={(e) => setUploadContent(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded text-slate-100 font-mono text-xs focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="p-3 rounded bg-cyan-950/20 border border-cyan-800/30 text-[11px] text-cyan-300/90 leading-relaxed font-mono">
                Will execute <code className="text-cyan-200">POST /knowledge/upload</code>, automatically chunk into section blocks, update inverted token index, and recalculate BM25 IDF weights.
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  className="px-3 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className="px-4 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-medium disabled:opacity-50"
                >
                  {isUploading ? 'Indexing...' : 'Index Document'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
