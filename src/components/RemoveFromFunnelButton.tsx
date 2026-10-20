import { useState } from 'react';
import { FolderCheck, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { saveProcess, type SavedProcess } from '@/lib/store';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Props {
  process: SavedProcess;
  /** Chamado com o processo atualizado (in_funnel = false) depois de remover. */
  onRemoved: (updated: SavedProcess) => void;
  /** 'icon': lixeira (Dashboard); 'card': X no cartão do funil; 'search': pasta destacada na busca; 'button': botão com texto (detalhe). */
  variant?: 'icon' | 'card' | 'button' | 'search';
}

/** Remove o processo do funil (e, portanto, do Dashboard), com confirmação. */
export function RemoveFromFunnelButton({ process, onRemoved, variant = 'icon' }: Props) {
  const [open, setOpen] = useState(false);

  const remove = async () => {
    try {
      const updated = await saveProcess(process, { in_funnel: false, funnel_stage: 'Encontrado' });
      toast.success(process.is_favorite ? 'Removido do funil (continua nos Favoritos)' : 'Removido do funil');
      onRemoved(updated);
    } catch (err: any) {
      toast.error('Erro ao remover: ' + (err.message || err));
    }
  };

  // Cartões do funil e linhas do Dashboard são clicáveis: o clique no botão não pode abrir o processo.
  const openDialog = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(true);
  };

  let trigger: React.ReactNode;
  if (variant === 'button') {
    trigger = (
      <Button variant="outline" className="w-full gap-1 text-destructive hover:text-destructive" onClick={openDialog}>
        <Trash2 className="h-4 w-4" /> Remover do funil
      </Button>
    );
  } else if (variant === 'search') {
    // Na busca: pasta destacada indica "já está no funil"; clicar remove.
    trigger = (
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-primary hover:text-destructive"
        aria-label="Remover do funil"
        title={`No funil (${process.funnel_stage}) — clique para remover`}
        onClick={openDialog}
      >
        <FolderCheck className="h-3.5 w-3.5" />
      </Button>
    );
  } else if (variant === 'card') {
    trigger = (
      <button
        type="button"
        aria-label="Remover do funil"
        title="Remover do funil"
        onClick={openDialog}
        onMouseDown={e => e.stopPropagation()}
        className="rounded p-0.5 text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    );
  } else {
    trigger = (
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-destructive"
        aria-label="Remover do funil"
        title="Remover do funil"
        onClick={openDialog}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    );
  }

  return (
    <>
      {trigger}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent onClick={e => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover do funil?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="mb-2 line-clamp-2 font-medium text-foreground" title={process.title}>“{process.title}”</span>
              Ele sai do Funil Operacional e do Dashboard.{' '}
              {process.is_favorite
                ? 'Ele continua nos Favoritos, com as suas observações.'
                : 'As observações e os documentos vinculados a ele serão descartados (os documentos continuam salvos em Documentos).'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={remove}>
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
