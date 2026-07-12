export const btn = (extra={}) => ({
  border:"none", borderRadius:8, padding:"9px 16px", cursor:"pointer",
  fontWeight:600, fontSize:13, ...extra
});

export const card = { background:"white", borderRadius:12, padding:20, boxShadow:"0 1px 4px rgba(0,0,0,0.08)", border:"1px solid #f1f5f9" };

export const input = { width:"100%", padding:"9px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:13, boxSizing:"border-box", outline:"none", background:"white" };

export const label = { fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:5 };
