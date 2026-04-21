"use client";

import { useEffect, useState, useRef } from "react";
import { use } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";

interface DocumentsPageProps {
  params: Promise<{ id: string }>;
}

interface Document {
  id: string;
  project_id: string;
  file_name: string;
  file_type: string;
  file_size_bytes: number;
  processing_status: "pending" | "processing" | "completed" | "failed";
  extracted_data: Record<string, unknown> | null;
  created_at: string;
}

export default function DocumentsPage({ params }: DocumentsPageProps) {
  const { id: projectId } = use(params);
  
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.get<{ data: Document[] }>(`/projects/${projectId}/documents`);
        setDocuments(data.data || []);
        setError(null);
      } catch (err) {
        const msg = err instanceof ApiError ? err.detail : err instanceof Error ? err.message : "Failed to load";
        console.warn("Documents load error:", msg);
        setError(msg);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [projectId]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    
    setIsProcessing(true);
    setProgress(10);
    setTerminalLogs(["[System] Uploading document..."]);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      
      // Upload the document
      setProgress(30);
      setTerminalLogs((prev) => [...prev, "[System] Upload complete. Starting processing..."]);
      
      const uploadResponse = await api.upload<{ data: Document }>(
        `/projects/${projectId}/documents/upload`,
        formData
      );
      
      setProgress(50);
      setTerminalLogs((prev) => [...prev, "[AI] Analyzing document content..."]);

      // Trigger processing
      const docId = uploadResponse.data.id;
      await api.post(`/projects/${projectId}/documents/${docId}/process`);
      
      setProgress(70);
      setTerminalLogs((prev) => [...prev, "[AI] Extracting architectural rules..."]);

      // Poll for completion
      let attempts = 0;
      while (attempts < 20) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const statusCheck = await api.get<{ data: Document }>(`/projects/${projectId}/documents/${docId}`);
        
        if (statusCheck.data.processing_status === "completed" || statusCheck.data.processing_status === "failed") {
          setProgress(100);
          setTerminalLogs((prev) => [...prev, `[System] Processing ${statusCheck.data.processing_status}`]);
          
          // Refresh documents
          const docs = await api.get<{ data: Document[] }>(`/projects/${projectId}/documents`);
          setDocuments(docs.data || []);
          break;
        }
        attempts++;
      }
      
      toast.success("Document processed successfully!");
      setIsUploadOpen(false);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : err instanceof Error ? err.message : "Upload failed";
      setTerminalLogs((prev) => [...prev, `[Error] ${msg}`]);
      toast.error(msg);
    } finally {
      setIsProcessing(false);
      setSelectedFile(null);
    }
  };

  const getStatusVariant = (status: string) => {
    if (status === "completed") return "default";
    if (status === "failed") return "destructive";
    if (status === "processing") return "secondary";
    return "outline";
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-medium">Documents</h2>
          <p className="text-sm text-muted-foreground">Upload architecture documents for AI rule extraction.</p>
        </div>
        
        <Dialog open={isUploadOpen} onOpenChange={(open) => {
          if (!isProcessing) {
            setIsUploadOpen(open);
            setTerminalLogs([]);
            setProgress(0);
          }
        }}>
          <DialogTrigger asChild>
            <Button>Upload Document</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Upload Architecture Document</DialogTitle>
              <DialogDescription>
                Upload documents or diagrams for AI rule extraction.
              </DialogDescription>
            </DialogHeader>
            
            {!isProcessing ? (
              <div className="grid gap-4 py-4">
                <div 
                  className="border-2 border-dashed rounded-lg p-10 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="bg-primary/10 p-3 rounded-full mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-primary"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M12 12v9"/><path d="m16 16-4-4-4 4"/></svg>
                  </div>
                  <p className="font-medium">{selectedFile ? selectedFile.name : "Click to upload or drag and drop"}</p>
                  <p className="text-xs text-muted-foreground mt-1">PNG, JPG, PDF or TXT (max. 10MB)</p>
                </div>
                <input 
                  ref={fileInputRef}
                  type="file" 
                  className="hidden" 
                  accept=".pdf,.png,.jpg,.jpeg,.txt,.md"
                  onChange={handleFileSelect}
                />
              </div>
            ) : (
              <div className="py-6 space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-primary animate-pulse">Processing...</span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
                
                <div className="bg-black text-green-400 font-mono text-xs rounded-md p-4 h-32">
                  <ScrollArea className="h-full">
                    {terminalLogs.map((log, i) => (
                      <div key={i} className="mb-1 opacity-80">{log}</div>
                    ))}
                  </ScrollArea>
                </div>
              </div>
            )}
            
            <DialogFooter>
              {!isProcessing && (
                <Button 
                  type="button" 
                  onClick={handleUpload}
                  disabled={!selectedFile}
                >
                  Start Analysis
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {error && !loading && (
        <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
          <CardContent className="pt-4">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              ⚠️ {error}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                </TableRow>
              ))
            ) : documents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  No documents uploaded yet.
                </TableCell>
              </TableRow>
            ) : (
              documents.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell className="font-medium">
                    {doc.file_name}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="uppercase text-[10px]">
                      {doc.file_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatBytes(doc.file_size_bytes)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusVariant(doc.processing_status)}>
                      {doc.processing_status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {new Date(doc.created_at).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}