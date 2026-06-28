'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAppStore } from '@/stores/app-store';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Upload, Download, FileSpreadsheet, AlertCircle, Loader2,
  FileUp, File, FileText, X,
} from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

export default function BulkImportPage() {
  const { token } = useAppStore();
  const perms = usePermissions();
  const [modules, setModules] = useState<any[]>([]);
  const [selectedModuleId, setSelectedModuleId] = useState('');
  const [templateHeaders, setTemplateHeaders] = useState<any[]>([]);
  const [pasteData, setPasteData] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('paste');

  // File upload state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedData, setUploadedData] = useState<Record<string, string>[]>([]);
  const [uploadPreview, setUploadPreview] = useState<{ headers: string[]; rowCount: number } | null>(null);
  const [uploadError, setUploadError] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadModules = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/modules', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setModules(data.modules || []);
      if (data.modules?.length > 0) {
        setSelectedModuleId(data.modules[0].id);
      }
    } catch {
      toast.error('Failed to load modules');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadModules();
  }, [loadModules]);

  const loadTemplate = async (moduleId: string) => {
    if (!token || !moduleId) return;
    try {
      const res = await fetch(`/api/bulk?action=template&moduleId=${moduleId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setTemplateHeaders(data.headers || []);
      }
    } catch {
      // silent
    }
  };

  useEffect(() => {
    if (selectedModuleId) {
      loadTemplate(selectedModuleId);
      setImportResult(null);
    }
  }, [selectedModuleId]);

  // Parse uploaded file
  const parseFile = (file: File) => {
    setUploadError('');
    setUploadPreview(null);
    setUploadedData([]);

    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'application/csv',
    ];
    const validExtensions = ['.xlsx', '.xls', '.csv'];
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();

    if (!validExtensions.includes(ext) && !validTypes.includes(file.type)) {
      setUploadError('Invalid file type. Please upload .xlsx, .xls, or .csv files only.');
      return;
    }

    setUploadedFile(file);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' });

        if (jsonData.length === 0) {
          setUploadError('The file appears to be empty.');
          return;
        }

        const headers = Object.keys(jsonData[0]);
        setUploadPreview({ headers, rowCount: jsonData.length });
        setUploadedData(jsonData);
      } catch {
        setUploadError('Failed to parse the file. Please ensure it is a valid spreadsheet.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      parseFile(files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      parseFile(files[0]);
    }
    // Reset the input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const clearFile = () => {
    setUploadedFile(null);
    setUploadedData([]);
    setUploadPreview(null);
    setUploadError('');
  };

  const handleImport = async () => {
    if (!token || !selectedModuleId) {
      toast.error('Please select a module');
      return;
    }

    let data: Record<string, string>[] = [];

    if (activeTab === 'paste') {
      if (!pasteData.trim()) {
        toast.error('Please enter data');
        return;
      }
      // Parse CSV data with ';' delimiter
      const lines = pasteData.trim().split('\n');
      const headers = lines[0].split(';').map((h) => h.trim().replace(/^"|"$/g, ''));

      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = lines[i].split(';').map((v) => v.trim().replace(/^"|"$/g, ''));
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => {
          row[h] = values[idx] || '';
        });
        data.push(row);
      }
    } else {
      if (uploadedData.length === 0) {
        toast.error('Please upload a file first');
        return;
      }
      data = uploadedData;
    }

    setImporting(true);
    setImportResult(null);

    try {
      const res = await fetch('/api/bulk?action=import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ moduleId: selectedModuleId, data }),
      });

      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error || 'Import failed');
        return;
      }

      setImportResult(result);
      if (result.validRows > 0) {
        toast.success(`Imported ${result.validRows} records successfully`);
      }
      if (result.invalidRows > 0) {
        toast.warning(`${result.invalidRows} rows had validation errors`);
      }
    } catch {
      toast.error('Network error during import');
    } finally {
      setImporting(false);
    }
  };

  const handleExport = async () => {
    if (!token || !selectedModuleId) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/bulk?action=export&moduleId=${selectedModuleId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Export failed'); return; }

      if (data.data && data.data.length > 0) {
        const allKeys = new Set<string>();
        data.data.forEach((row: any) => Object.keys(row).forEach((k) => allKeys.add(k)));
        const keys = Array.from(allKeys);

        const csv = [
          keys.join(';'),
          ...data.data.map((row: any) => keys.map((k) => String(row[k] ?? '')).join(';')),
        ].join('\n');

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${data.moduleCode || 'export'}_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`Exported ${data.total} records`);
      } else {
        toast.info('No records to export');
      }
    } catch {
      toast.error('Network error during export');
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadTemplate = () => {
    if (templateHeaders.length === 0) return;
    const headerLine = templateHeaders.map((h) => h.fieldCode).join(';');
    const placeholderLine = templateHeaders.map((h) => h.placeholder || h.fieldCode).join(';');
    const csv = headerLine + '\n' + placeholderLine;

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const modName = modules.find((m) => m.id === selectedModuleId)?.moduleCode || 'template';
    a.download = `${modName}_template.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Template downloaded');
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Bulk Import / Export</h2>
        <p className="text-muted-foreground text-sm mt-1">Import records from spreadsheet files or CSV data, and export existing records</p>
      </div>

      {/* Module Selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="space-y-1">
          <Label>Module</Label>
          <Select value={selectedModuleId} onValueChange={setSelectedModuleId}>
            <SelectTrigger className="w-[250px] h-11">
              <SelectValue placeholder="Select module" />
            </SelectTrigger>
            <SelectContent>
              {modules.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.moduleName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Template Info */}
      {templateHeaders.length > 0 && (
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-lg">Template Fields</CardTitle>
              <CardDescription>{templateHeaders.length} fields required for import</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleDownloadTemplate} className="h-9">
              <Download className="w-4 h-4 mr-1" /> Download Template
            </Button>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {templateHeaders.map((h: any) => (
                <Badge key={h.fieldCode} variant="outline" className="text-xs">
                  {h.fieldName}
                  {h.isRequired && <span className="text-red-500 ml-0.5">*</span>}
                  <span className="text-muted-foreground ml-1">({h.dataType})</span>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Import */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Upload className="w-5 h-5 text-red-600" />
              Import Data
            </CardTitle>
            <CardDescription>Upload a spreadsheet or paste CSV data (semicolon ; delimiter) with headers</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full h-9">
                <TabsTrigger value="paste" className="flex-1 text-xs h-7">
                  <FileText className="w-3.5 h-3.5 mr-1.5" />
                  Paste Data
                </TabsTrigger>
                <TabsTrigger value="upload" className="flex-1 text-xs h-7">
                  <FileUp className="w-3.5 h-3.5 mr-1.5" />
                  Upload File
                </TabsTrigger>
              </TabsList>

              <TabsContent value="paste" className="mt-3 space-y-3">
                <Textarea
                  value={pasteData}
                  onChange={(e) => setPasteData(e.target.value)}
                  placeholder={`field_code_1;field_code_2;field_code_3\nvalue1;value2;value3\nvalue4;value5;value6`}
                  rows={8}
                  className="font-mono text-xs"
                />
                {pasteData.trim() && (
                  <p className="text-xs text-muted-foreground">
                    {pasteData.trim().split('\n').length - 1} data row(s) detected
                  </p>
                )}
              </TabsContent>

              <TabsContent value="upload" className="mt-3 space-y-3">
                {!uploadedFile ? (
                  <div
                    className={cn(
                      'border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer',
                      isDragging
                        ? 'border-red-400 bg-red-50/50'
                        : 'border-muted-foreground/25 hover:border-red-300 hover:bg-accent/30'
                    )}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <FileSpreadsheet className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                    <p className="text-sm font-medium">
                      Drag & drop your file here, or <span className="text-red-600 underline">browse</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Supports .xlsx, .xls, and .csv files
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </div>
                ) : (
                  <div className="border rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-red-50">
                          <File className="w-5 h-5 text-red-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{uploadedFile.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {(uploadedFile.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={clearFile}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>

                    {uploadError && (
                      <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                        <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                        <p className="text-xs text-red-600">{uploadError}</p>
                      </div>
                    )}

                    {uploadPreview && (
                      <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Preview</span>
                          <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">
                            {uploadPreview.rowCount} rows
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {uploadPreview.headers.slice(0, 6).map((h) => (
                            <Badge key={h} variant="secondary" className="text-[10px]">{h}</Badge>
                          ))}
                          {uploadPreview.headers.length > 6 && (
                            <Badge variant="secondary" className="text-[10px]">
                              +{uploadPreview.headers.length - 6} more
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>
            </Tabs>

            <Button
              className="w-full bg-red-600 hover:bg-red-700 text-white h-11"
              onClick={handleImport}
              disabled={importing || !selectedModuleId || !perms.canImport || (activeTab === 'paste' ? !pasteData.trim() : uploadedData.length === 0)}
            >
              {importing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Import Records
                </>
              )}
            </Button>

            {/* Import Result */}
            {importResult && (
              <div className="space-y-3">
                <Progress
                  value={(importResult.validRows / importResult.totalRows) * 100}
                  className="h-2"
                />
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <p className="text-2xl font-bold">{importResult.totalRows}</p>
                    <p className="text-xs text-muted-foreground">Total</p>
                  </div>
                  <div className="text-center p-3 bg-green-50 rounded-lg">
                    <p className="text-2xl font-bold text-green-600">{importResult.validRows}</p>
                    <p className="text-xs text-green-600">Valid</p>
                  </div>
                  <div className="text-center p-3 bg-red-50 rounded-lg">
                    <p className="text-2xl font-bold text-destructive">{importResult.invalidRows}</p>
                    <p className="text-xs text-destructive">Failed</p>
                  </div>
                </div>

                {importResult.errors?.length > 0 && (
                  <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                    <p className="text-sm font-medium text-destructive flex items-center gap-1">
                      <AlertCircle className="w-4 h-4" /> Error Details
                    </p>
                    {importResult.errors.map((e: any, idx: number) => (
                      <div key={idx} className="text-xs p-2 bg-red-50 border border-red-200 rounded">
                        <span className="font-medium">Row {e.row}:</span> {e.errors.join('; ')}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Export */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Download className="w-5 h-5 text-teal-600" />
              Export Data
            </CardTitle>
            <CardDescription>Download active records as CSV file</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="py-8 text-center border-2 border-dashed rounded-xl">
              <FileSpreadsheet className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                Export all active records from the selected module
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Data will be downloaded as a CSV file (semicolon ; delimiter)
              </p>
            </div>
            <Button
              variant="outline"
              className="w-full h-11"
              onClick={handleExport}
              disabled={exporting || !selectedModuleId || !perms.canExport}
            >
              {exporting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Export Records
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


