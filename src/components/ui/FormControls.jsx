import { label, input } from "../../helpers/styles";

export function Field({lab,children}){ return <div style={{marginBottom:14}}><label style={label}>{lab}</label>{children}</div>; }

export function Input({lab,...props}){
  return <Field lab={lab}><input style={input} {...props}/></Field>;
}

export function Select({lab,children,...props}){
  return <Field lab={lab}><select style={input} {...props}>{children}</select></Field>;
}

export function Badge({color,children}){
  return <span style={{background:color+"22",color,padding:"3px 10px",borderRadius:99,fontSize:11,fontWeight:700}}>{children}</span>;
}

export function Alert({type="success",children}){
  const colors={success:{bg:"#dcfce7",border:"#86efac",text:"#166534"},error:{bg:"#fee2e2",border:"#fca5a5",text:"#dc2626"},warn:{bg:"#fef3c7",border:"#fcd34d",text:"#92400e"}};
  const c=colors[type];
  return <div style={{background:c.bg,border:`1px solid ${c.border}`,color:c.text,padding:"10px 14px",borderRadius:8,marginBottom:14,fontSize:13,fontWeight:600}}>{children}</div>;
}
