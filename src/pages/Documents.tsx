import { useEffect, useState } from 'react';
import { addDocument, deleteDocument, getDocumentFileUrl, listDocuments, type CompanyDocument } from '@/lib/store';
import { DOCUMENT_CATEGORIES, formatDate } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { FileText, Plus, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';

const Documents = () => {
  const [docs, setDocs] = useState<CompanyDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Form
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const loadDocs = async () => {
    setDocs(await listDocuments());
    setLoading(false);
  };

  useEffect(() => { loadDocs(); }, []);

  const handleUpload = async () => {
    if (!name || !category) { toast.error('Preencha nome e categoria.'); return; }
    setUploading(true);
    try {
      await addDocument({
        name,
        category,
        expiry_date: expiryDate || null,
        notes: notes || null,
        file: file ? { blob: file, name: file.name, type: file.type } : null,
      });
      toast.success('Documento cadastrado!');
      setName(''); setCategory(''); setExpiryDate(''); setNotes(''); setFile(null);
      setDialogOpen(false);
      loadDocs();
    } catch (err: any) {
      toast.error('Erro ao salvar documento: ' + (err.message || err));
    } finally {
      setUploading(false);
    }
  };

  const openFile = async (docId: string) => {
    // Abre a janela ainda dentro do clique; após um await o Safari bloqueia como pop-up
    const win = window.open('', '_blank');
    const url = await getDocumentFileUrl(docId);
    if (!win) return;
    if (url) win.location.href = url;
    else win.close();
  };

  const deleteDoc = async (docId: string) => {
    await deleteDocument(docId);
    setDocs(prev => prev.filter(d => d.id !== docId));
    toast.success('Documento removido.');
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Documentos</h1>
          <p className="text-sm text-muted-foreground">Gerencie os documentos da sua empresa</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1"><Plus className="h-4 w-4" /> Novo Documento</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Cadastrar Documento</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nome do documento" />
              </div>
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Validade</Label>
                <Input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Arquivo</Label>
                <Input type="file" onChange={e => setFile(e.target.files?.[0] || null)} />
              </div>
              <div className="space-y-2">
                <Label>Observação</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observações..." rows={3} />
              </div>
              <Button onClick={handleUpload} disabled={uploading} className="w-full gap-1">
                <Upload className="h-4 w-4" /> {uploading ? 'Enviando...' : 'Cadastrar'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-xl bg-card shadow-card overflow-x-auto">
        {docs.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">Nenhum documento cadastrado.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3">Nome</th>
                <th className="px-5 py-3">Categoria</th>
                <th className="px-5 py-3">Validade</th>
                <th className="px-5 py-3">Observação</th>
                <th className="px-5 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {docs.map(doc => (
                <tr key={doc.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      {doc.file ? (
                        <button type="button" onClick={() => openFile(doc.id)} className="font-medium text-primary hover:underline">{doc.name}</button>
                      ) : (
                        <span className="font-medium text-card-foreground">{doc.name}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{doc.category}</td>
                  <td className="px-5 py-3 text-muted-foreground">{formatDate(doc.expiry_date)}</td>
                  <td className="max-w-[200px] truncate px-5 py-3 text-muted-foreground">{doc.notes || '—'}</td>
                  <td className="px-5 py-3">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteDoc(doc.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default Documents;
