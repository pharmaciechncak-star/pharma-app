import { useState, useEffect } from "react";
import { EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY, sendRealEmail } from "../email";
import { PageHeader } from "./ui/PageHeader";
import { Alert } from "./ui/FormControls";
import { card, label, input, btn } from "../helpers/styles";
import { fmtDate } from "../constants";
import { hasSupplierAccess } from "../permissions";

export function MessagingPage({store,activeSupplier,pendingInvoiceId,onClearPending,currentUser}){
  const [form,setForm]=useState({subject:"",body:"",attachInvoice:"",extraRecipients:""});
  const [sent,setSent]=useState(false);
  const [openMsg,setOpenMsg]=useState(null);
  const invoices=activeSupplier ? store.invoices.filter(i=>i.supplierId===activeSupplier.id) : store.invoices.filter(i=>hasSupplierAccess(currentUser,i.supplierId));
  const messages=activeSupplier ? store.messages.filter(m=>m.supplierId===activeSupplier.id) : store.messages.filter(m=>hasSupplierAccess(currentUser,m.supplierId));

  // Pré-remplir si on arrive depuis une facture
  useEffect(()=>{
    if(!pendingInvoiceId) return;
    const inv = store.invoices.find(i=>i.id===pendingInvoiceId);
    if(inv){
      setForm(f=>({
        ...f,
        attachInvoice: inv.id,
        subject: "Facture " + inv.reference + " — " + (inv.month||""),
        body: "Bonjour,\n\nVeuillez trouver ci-joint la facture " + inv.reference +
              " pour la période " + (inv.month||"") +
              " d'un montant de " + Number(inv.total||0).toLocaleString("fr-FR") + " FCFA.\n\nCordialement,\nCHNCAK",
      }));
    }
    onClearPending?.();
  },[pendingInvoiceId]);

  const [sending,  setSending]   = useState(false);
  const [sendError,setSendError] = useState("");

  const send = async () => {
    if(!activeSupplier){ alert("Sélectionnez un fournisseur actif."); return; }
    if(!form.subject.trim()){ alert("Veuillez saisir un objet."); return; }
    if(!form.body.trim()){    alert("Veuillez saisir un message."); return; }
    setSending(true); setSendError("");

    // Détails de la facture jointe (texte formaté pour l'email)
    let invoiceDetails = "";
    if(form.attachInvoice){
      const inv = store.invoices.find(i=>i.id===form.attachInvoice);
      if(inv){
        invoiceDetails = "=== FACTURE " + inv.reference + " ===\n"
          + "Période : " + inv.month + "\n"
          + "Fournisseur : " + inv.supplier + "\n"
          + "\nDétail :\n"
          + (inv.items||[]).map(it =>
              "  • " + it.productName + " × " + it.qty + "  →  "
              + Number(it.total||0).toLocaleString("fr-FR") + " FCFA"
            ).join("\n")
          + "\n\nTOTAL : " + Number(inv.total||0).toLocaleString("fr-FR") + " FCFA";
      }
    }

    // Vérifier si EmailJS est configuré
    const emailjsConfigured = EMAILJS_SERVICE_ID !== "VOTRE_SERVICE_ID"
      && EMAILJS_TEMPLATE_ID !== "VOTRE_TEMPLATE_ID"
      && EMAILJS_PUBLIC_KEY  !== "VOTRE_PUBLIC_KEY";

    if(emailjsConfigured){
      try {
        // Envoi au destinataire principal
        await sendRealEmail({
          to:               activeSupplier.email,
          toName:           activeSupplier.name,
          from:             "CHNCAK PharmaStock",
          subject:          form.subject,
          body:             form.body,
          invoiceDetails,
          extraRecipients:  form.extraRecipients,
        });
        // Envoi aux destinataires supplémentaires
        if(form.extraRecipients){
          const extras = form.extraRecipients.split(",").map(e=>e.trim()).filter(Boolean);
          for(const email of extras){
            await sendRealEmail({
              to: email, toName: email, from:"CHNCAK PharmaStock",
              subject: form.subject, body: form.body, invoiceDetails,
            });
          }
        }
        // Enregistrer dans Firebase
        store.addMessage({
          ...form, to:activeSupplier.name, toEmail:activeSupplier.email,
          supplierId:activeSupplier.id, from:"admin@pharma.com", emailSent:true,
        });
        // Marquer la facture comme "envoyée" dans Firestore
        if(form.attachInvoice){
          store.updateInvoice(form.attachInvoice, { status:"envoyée" });
        }
        setForm({subject:"",body:"",attachInvoice:"",extraRecipients:""});
        setSent(true); setTimeout(()=>setSent(false),5000);
      } catch(e){
        console.error("EmailJS error:", e);
        setSendError("❌ Erreur d'envoi : " + (e?.text || e?.message || "Vérifiez votre configuration EmailJS."));
      }
    } else {
      // EmailJS pas encore configuré — enregistrer seulement dans Firebase
      store.addMessage({
        ...form, to:activeSupplier.name, toEmail:activeSupplier.email,
        supplierId:activeSupplier.id, from:"admin@pharma.com", emailSent:false,
      });
      setForm({subject:"",body:"",attachInvoice:"",extraRecipients:""});
      setSendError("⚠️ Message enregistré mais EMAIL NON ENVOYÉ. Configurez EmailJS pour activer l'envoi réel (voir les instructions dans le code).");
      setTimeout(()=>setSendError(""),8000);
    }
    setSending(false);
  };

  const handleOpen=(m)=>{
    setOpenMsg(m.id===openMsg?null:m.id);
    if(!m.read) store.markRead(m.id);
  };

  return(
    <div style={{padding:16}}>
      <PageHeader pageId="messagerie" title="✉️ Messagerie" subtitle={activeSupplier?.name || "Sélectionnez un fournisseur"}/>
      {!activeSupplier&&<Alert type="warn">⚠️ Sélectionnez un fournisseur actif pour envoyer des messages.</Alert>}
      {sent&&<Alert type="success">✅ Email envoyé à {activeSupplier?.name} ({activeSupplier?.email}) !</Alert>}
      {sendError&&<Alert type={sendError.startsWith("⚠️")?"warn":"error"}>{sendError}</Alert>}
      {activeSupplier&&(
        <div style={{...card,marginBottom:14}}>
          <div style={{fontWeight:700,marginBottom:12,fontSize:14}}>Nouveau Message</div>
          <div style={{marginBottom:10}}>
            <label style={label}>Destinataire principal</label>
            <div style={{...input,background:"#f8fafc",color:"#1e293b",display:"flex",alignItems:"center",gap:6}}>
              🏢 {activeSupplier.name} ({activeSupplier.email})
            </div>
          </div>
          <div style={{marginBottom:10}}>
            <label style={label}>Destinataires supplémentaires <span style={{fontWeight:400,color:"#94a3b8"}}>(emails séparés par virgule)</span></label>
            <input style={input} value={form.extraRecipients} onChange={e=>setForm(f=>({...f,extraRecipients:e.target.value}))} placeholder="collegue@example.com, autre@example.com"/>
          </div>
          <div style={{marginBottom:10}}>
            <label style={label}>Objet</label>
            <input style={input} value={form.subject} onChange={e=>setForm(f=>({...f,subject:e.target.value}))} placeholder="Objet du message..."/>
          </div>
          <div style={{marginBottom:10}}>
            <label style={label}>Joindre une Facture</label>
            <select style={input} value={form.attachInvoice} onChange={e=>setForm(f=>({...f,attachInvoice:e.target.value}))}>
              <option value="">Aucune</option>
              {invoices.map(inv=><option key={inv.id} value={inv.id}>{inv.reference} — {inv.month} — {Number(inv.total||0).toLocaleString("fr-FR")} FCFA</option>)}
            </select>
          </div>
          <div style={{marginBottom:14}}>
            <label style={label}>Message</label>
            <textarea style={{...input,height:100,resize:"vertical"}} value={form.body} onChange={e=>setForm(f=>({...f,body:e.target.value}))} placeholder="Votre message..."/>
          </div>
          <button onClick={send} disabled={sending}
            style={{...btn(),background:sending?"#94a3b8":"#0891b2",color:"white",width:"100%",padding:11,fontSize:14}}>
            {sending?"⏳ Envoi en cours...":"📤 Envoyer le message"}
          </button>
        </div>
      )}
      <div style={{...card}}>
        <div style={{fontWeight:700,marginBottom:12,fontSize:14}}>Messages envoyés ({messages.length})</div>
        {messages.length===0
          ?<div style={{color:"#94a3b8",textAlign:"center",padding:20,fontSize:13}}>Aucun message</div>
          :messages.map(m=>(
            <div key={m.id} style={{borderRadius:8,marginBottom:8,border:"1px solid #f1f5f9",overflow:"hidden"}}>
              <div onClick={()=>handleOpen(m)} style={{background:m.read?"#f8fafc":"#eff6ff",padding:"10px 14px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:700,color:"#1e293b",fontSize:13,display:"flex",alignItems:"center",gap:8}}>
                    {!m.read&&<span style={{width:8,height:8,borderRadius:"50%",background:"#3b82f6",display:"inline-block"}}/>}
                    {m.subject||"(Sans objet)"}
                  </div>
                  <div style={{fontSize:11,color:"#64748b",display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                    <span>À : {m.to}{m.extraRecipients?` + ${m.extraRecipients.split(",").filter(x=>x.trim()).length} autre(s)`:""}</span>
                    <span>· {fmtDate(m.date)}</span>
                    {m.emailSent===true  && <span style={{background:"#dcfce7",color:"#059669",padding:"1px 6px",borderRadius:99,fontSize:10,fontWeight:700}}>✉️ Envoyé</span>}
                    {m.emailSent===false && <span style={{background:"#fef3c7",color:"#92400e",padding:"1px 6px",borderRadius:99,fontSize:10,fontWeight:700}}>📋 Enregistré</span>}
                  </div>
                </div>
                <span style={{fontSize:11,color:"#94a3b8"}}>{openMsg===m.id?"▲":"▼"}</span>
              </div>
              {openMsg===m.id&&(
                <div style={{background:"white",padding:"12px 14px",borderTop:"1px solid #f1f5f9"}}>
                  {m.createdByName&&<div style={{fontSize:11,color:"#64748b",marginBottom:6}}>👤 Envoyé par : <b>{m.createdByName}</b></div>}
                  {m.extraRecipients&&<div style={{fontSize:11,color:"#7c3aed",marginBottom:6}}>📧 Copie à : {m.extraRecipients}</div>}
                  <div style={{fontSize:13,color:"#374151",lineHeight:1.6,whiteSpace:"pre-wrap"}}>{m.body}</div>
                  {m.attachInvoice&&<div style={{fontSize:11,color:"#7c3aed",marginTop:8,padding:"6px 10px",background:"#fdf4ff",borderRadius:6}}>📎 Facture jointe : {store.invoices.find(i=>i.id===m.attachInvoice)?.reference||m.attachInvoice}</div>}
                </div>
              )}
            </div>
          ))
        }
      </div>
    </div>
  );
}
