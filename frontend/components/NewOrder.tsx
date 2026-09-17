'use client';
import { useEffect, useState } from 'react';
import { Search, Check, Camera, ArrowLeft, X } from 'lucide-react';
import { api, post } from '../lib/api';
import { Modal, Field, ErrorBox, Submit, useAction, Empty, TableSkeleton, toast } from './ui';
import {useDebounced,useQuery} from '../lib/use-query';
const checks = [
  'Tela',
  'Carcaça',
  'Tampa traseira',
  'Câmeras',
  'Botões',
  'Conector de carga',
  'Alto-falante',
  'Microfone',
  'Biometria',
  'Face ID',
  'Wi-Fi',
  'Bluetooth',
  'Outros',
];
export default function NewOrder({
  close,
  created,
  user,
}: {
  close: () => void;
  created: (id: string) => void;
  user: any;
}) {
  const [step, setStep] = useState(0),
    [search, setSearch] = useState(''),
    [existing, setExisting] = useState<any[]>([]),
    [customer, setCustomer] = useState<any>(null),
    [devices, setDevices] = useState<any[]>([]),
    [device, setDevice] = useState<any>(null),
    [newCustomer, setNewCustomer] = useState(false),
    [newDevice, setNewDevice] = useState(false),
    [draft, setDraft] = useState<any>({ accessories: ['Aparelho'], checklist: Object.fromEntries(checks.map(key=>[key,'NÃO TESTADO'])) }),
    [files, setFiles] = useState<File[]>([]),
    [saved, setSaved] = useState<string | null>(null);
  const [customerDraft,setCustomerDraft]=useState<Record<string,string>>({}),[deviceDraft,setDeviceDraft]=useState<Record<string,string>>({});
  const [previews,setPreviews]=useState<{name:string;url:string}[]>([]),[uploaded,setUploaded]=useState(0);
  const a = useAction();
  const debounced=useDebounced(search);const query=useQuery<any>(debounced.length>1?'/customers?search='+encodeURIComponent(debounced):null);
  const matches=existing.length?existing:(search.length>1?query.data?.items||[]:[]);
  useEffect(()=>{const urls=files.map(file=>({name:file.name,url:URL.createObjectURL(file)}));setPreviews(urls);return()=>urls.forEach(x=>URL.revokeObjectURL(x.url))},[files]);
  const addFiles=(selected:File[])=>{if(selected.some(f=>!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>10*1024*1024)){a.setError('Selecione fotos JPEG, PNG ou WebP de até 10 MB.');return}a.setError('');setFiles(old=>[...old,...selected])};
  const selectCustomer = async (c: any) => {
    const found=(await api('/devices?customerId='+c.id)).items;
    if(customer?.id!==c.id){setDevice(null);setDeviceDraft({})}
    setCustomer(c);setDevices(found);setNewDevice(!found.length&&user.role!=='TECHNICIAN');
    setStep(1);
  };
  const create = () =>
    a.run(async () => {
      const order = saved
        ? { id: saved }
        : await post('/service-orders', { customerId: customer.id, deviceId: device.id, ...draft });
      setSaved(order.id);
      for (const [index,file] of files.entries()) {
        const form = new FormData();
        form.set('file', file);
        await api(`/service-orders/${order.id}/photos?type=ENTRY`, { method: 'POST', body: form });
        setUploaded(index+1);
      }
      toast('Ordem de serviço criada.');
      created(order.id);
    });
  return (
    <Modal wide variant="drawer" busy={a.busy} title="Nova ordem de serviço" onClose={close}>
      <div className="steps">
        {['Cliente', 'Aparelho', 'Problema', 'Fotos'].map((s, i) => (
          <div aria-current={i===step?'step':undefined} className={i === step ? 'current' : i < step ? 'done' : ''} key={s}>
            <span>{i < step ? <Check size={14} /> : i + 1}</span>
            {s}
          </div>
        ))}
      </div>
      <ErrorBox error={a.error} />
      {step === 0 && (
        <>
          <h3>Quem está trazendo o aparelho?</h3>
          <div className="search-input">
            <Search size={18} />
            <input
              autoFocus
              aria-label="Buscar cliente"
              placeholder="Busque pelo nome ou telefone"
              value={search}
              onChange={(e) => {setSearch(e.target.value);setExisting([])}}
            />
          </div>
          <ErrorBox error={query.error} retry={query.reload}/>
          {query.pending&&search.length>1&&<TableSkeleton/>}
          {!query.pending&&search.length>1&&!matches.length&&!query.error&&<Empty title="Cliente não encontrado" detail="Confira o nome ou telefone. Você também pode fazer um novo cadastro."/>}
          <div className="choices">
            {matches.map((c:any) => (
              <button key={c.id} onClick={() => a.run(() => selectCustomer(c))}>
                <span>
                  {c.name}
                  <small>{c.phone}</small>
                </span>
                <span>Selecionar →</span>
              </button>
            ))}
          </div>
          {user.role !== 'TECHNICIAN' && !newCustomer && (
            <button onClick={() => setNewCustomer(true)}>+ Cadastrar novo cliente</button>
          )}
          {newCustomer && (
            <form
              className="subform"
              onSubmit={(e) => {
                e.preventDefault();
                const d = Object.fromEntries(new FormData(e.currentTarget));
                a.run(async () => {
                  const result = await post('/customers', d);
                  if (result.existing) {
                    setExisting([result.customer]);
                    setNewCustomer(false);
                    a.setError('Este telefone já está cadastrado. Selecione o cliente encontrado.');
                    return;
                  }
                  await selectCustomer(result.customer);
                });
              }}
            >
              <div className="form-grid">
                <Field label="Nome *">
                  <input name="name" value={customerDraft.name||''} onChange={e=>setCustomerDraft({...customerDraft,name:e.target.value})} required autoComplete="name" />
                </Field>
                <Field label="Telefone / WhatsApp *">
                  <input
                    name="phone" value={customerDraft.phone||''} onChange={e=>setCustomerDraft({...customerDraft,phone:e.target.value})}
                    required
                    type="tel"
                    autoComplete="tel"
                    placeholder="DDD + telefone"
                  />
                </Field>
                <Field label="CPF (opcional)">
                  <input
                    name="cpf" value={customerDraft.cpf||''} onChange={e=>setCustomerDraft({...customerDraft,cpf:e.target.value})}
                    inputMode="numeric"
                    pattern="[0-9]{11}" data-format-hint="Informe os 11 números do CPF." maxLength={11}
                    placeholder="Somente números"
                  />
                </Field>
              </div>
              <Submit busy={a.busy}>Salvar e continuar</Submit>
            </form>
          )}
        </>
      )}
      {step === 1 && (
        <>
          <p>
            Cliente: <strong>{customer?.name}</strong>
          </p>
          <h3>Qual aparelho será atendido?</h3>
          <div className="choices">
            {devices.map((d) => (
              <button
                key={d.id}
                onClick={() => {
                  setDevice(d);
                  setStep(2);
                }}
              >
                <span>
                  {d.brand} {d.model}
                  <small>{d.imei || 'Sem IMEI informado'}</small>
                </span>
                <span>Selecionar →</span>
              </button>
            ))}
          </div>
          {!newDevice && user.role !== 'TECHNICIAN' && (
            <button onClick={() => setNewDevice(true)}>+ Novo aparelho</button>
          )}
          {newDevice && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const d = Object.fromEntries(new FormData(e.currentTarget));
                a.run(async () => {
                  setDevice(await post('/devices', { ...d, customerId: customer.id }));
                  setStep(2);
                });
              }}
            >
              <div className="form-grid">
                <Field label="Marca *">
                  <input name="brand" value={deviceDraft.brand||''} onChange={e=>setDeviceDraft({...deviceDraft,brand:e.target.value})} required placeholder="Ex.: Samsung" />
                </Field>
                <Field label="Modelo *">
                  <input name="model" value={deviceDraft.model||''} onChange={e=>setDeviceDraft({...deviceDraft,model:e.target.value})} required placeholder="Ex.: Galaxy A15" />
                </Field>
                <Field label="IMEI (opcional)">
                  <input name="imei" value={deviceDraft.imei||''} onChange={e=>setDeviceDraft({...deviceDraft,imei:e.target.value})} pattern="[0-9]{15}" data-format-hint="Informe os 15 números do IMEI." maxLength={15} inputMode="numeric" />
                </Field>
                <Field label="Cor (opcional)">
                  <input name="color" value={deviceDraft.color||''} onChange={e=>setDeviceDraft({...deviceDraft,color:e.target.value})} />
                </Field>
                <Field label="Senha / PIN (se necessário)">
                  <input name="pin" value={deviceDraft.pin||''} onChange={e=>setDeviceDraft({...deviceDraft,pin:e.target.value})} type="password" autoComplete="off" />
                </Field>
              </div>
              <Submit busy={a.busy}>Salvar e continuar</Submit>
            </form>
          )}
        </>
      )}
      {step === 2 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setStep(3);
          }}
        >
          <div className="context-strip">
            {customer.name} <span>·</span> {device.brand} {device.model}
          </div>
          <Field label="Problema relatado *">
            <textarea
              required
              value={draft.problem || ''}
              onChange={(e) => setDraft({ ...draft, problem: e.target.value })}
              placeholder="O que aconteceu com o aparelho?"
            />
          </Field>
          <Field label="Estado físico">
            <textarea
              value={draft.physicalState || ''}
              onChange={(e) => setDraft({ ...draft, physicalState: e.target.value })}
              placeholder="Riscos, trincas, marcas de queda…"
            />
          </Field>
          <Field label="Observações">
            <textarea
              value={draft.notes || ''}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />
          </Field>
          <h3>Acessórios recebidos</h3>
          <div className="checkboxes">
            {[
              'Aparelho',
              'Carregador',
              'Cabo',
              'Capinha',
              'Cartão de memória',
              'Chip',
              'Fone',
              'Outros',
            ].map((x) => (
              <label key={x}>
                <input
                  type="checkbox"
                  checked={draft.accessories.includes(x)}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      accessories: e.target.checked
                        ? [...draft.accessories, x]
                        : draft.accessories.filter((v: string) => v !== x),
                    })
                  }
                />
                {x}
              </label>
            ))}
          </div>
          <details className="checklist">
            <summary>
              Checklist de entrada <small>Não testado por padrão</small>
            </summary>
            <div className="form-grid">
              {checks.map((x) => (
                <Field label={x} key={x}>
                  <select
                    value={draft.checklist[x] || 'NÃO TESTADO'}
                    onChange={(e) =>
                      setDraft({ ...draft, checklist: { ...draft.checklist, [x]: e.target.value } })
                    }
                  >
                    {['NÃO TESTADO', 'OK', 'DANIFICADO', 'NÃO POSSUI'].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </Field>
              ))}
            </div>
          </details>
          <div className="actions">
            <Submit busy={false}>Continuar para fotos</Submit>
          </div>
        </form>
      )}
      {step === 3 && (
        <>
          <div className="context-strip">
            {customer.name} <span>·</span> {device.brand} {device.model}
          </div>
          <h3>Registre o estado de entrada</h3>
          <p>Fotografe a frente, traseira e danos existentes.</p>
          <label className="upload">
            <Camera size={28} />
            <strong>Selecionar fotos ou usar a câmera</strong>
            <small>JPEG, PNG ou WebP · até 10 MB por foto</small>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              disabled={a.busy||!!saved} onChange={(e) => addFiles(Array.from(e.target.files || []))}
            />
          </label>
          <label className="camera-label">
            Usar câmera do celular
            <input
              type="file"
              accept="image/*"
              capture="environment"
              disabled={a.busy||!!saved} onChange={(e) => addFiles(Array.from(e.target.files || []))}
            />
          </label>
          {files.length > 0 && <><p>{files.length} foto(s) selecionada(s)</p><div className="file-previews">{previews.map((p,index)=><div key={p.url}><img src={p.url} alt={'Prévia de '+p.name} width={140} height={90}/><small title={p.name}>{p.name}</small><button type="button" className="icon" disabled={a.busy||!!saved} aria-label={'Remover '+p.name} onClick={()=>setFiles(files.filter((_,i)=>i!==index))}><X size={15}/></button></div>)}</div>{a.busy&&<><p role="status">Enviando fotos: {uploaded} de {files.length}</p><progress className="upload-progress" value={uploaded} max={files.length}/></>}</>}
          {saved && !a.busy && (
            <div className="error">
              A OS foi criada, mas uma foto não foi enviada. Abra a OS para conferir e completar as
              fotos.<button onClick={() => created(saved)}>Abrir OS criada</button>
            </div>
          )}
          <div className="actions">
            <button className="primary" disabled={a.busy || !!saved} onClick={create}>
              {a.busy ? 'Salvando…' : 'Criar ordem de serviço'}
            </button>
          </div>
        </>
      )}
      {step > 0 && !saved && (
        <button className="link" disabled={a.busy} onClick={() => setStep(step - 1)}>
          <ArrowLeft size={16} /> Voltar
        </button>
      )}
    </Modal>
  );
}
