import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
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
  const { profile } = useAuth();
  const [docs, setDocs] = useState<any[]>([]);
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
    if (!profile?.company_id) { setLoading(false); return; }
    const { data } = await supabase.from('company_documents').select('*').eq('company_id', profile.company_id).order('created_at', { ascending: false });
    setDocs(data || []);
    setLoading(false);
  };

  useEffect(() => { loadDocs(); }, [profile?.company_id]);

  const handleUpload = async () => {
    if (!profile?.company_id) { toast.error('Configure sua empresa.'); return; }
    if (!name || !category) { toast.error('Preencha nome e categoria.'); return; }
    setUploading(true);

    let fileUrl = '';
    if (file) {
      const filePath = `${profile.company_id}/${category}/${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase.storage.from('company-documents').upload(filePath, file);
      if (uploadErr) { toast.error('Erro ao enviar arquivo: ' + uploadErr.message); setUploading(false); return; }
      const { data: urlData } = supabase.storage.from('company-documents').getPublicUrl(filePath);
      fileUrl = urlData.publicUrl;
    }

    await supabase.from('company_documents').insert({
      company_id: profile.company_id,
      name,
      category,
      expiry_date: expiryDate || null,
      file_url: fileUrl || null,
      notes: notes || null,
    });

    toast.success('Documento cadastrado!');
    setName(''); setCategory(''); setExpiryDate(''); setNotes(''); setFile(null);
    setDialogOpen(false);
    setUploading(false);
    loadDocs();
  };

  const deleteDoc = async (docId: string) => {
    await supabase.from('company_documents').delete().eq('id', docId);
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
                      {doc.file_url ? (
                        <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">{doc.name}</a>
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
