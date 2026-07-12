import { PageHeader } from "./PageHeader";
import { btn, card } from "../../helpers/styles";

export function HistoryPage({title,icon,pageId,items,renderItem,empty,onExportCSV}){
  return(
    <div style={{padding:16}}>
      <PageHeader
        pageId={pageId}
        title={icon + " " + title}
        subtitle={items.length + " enregistrement(s)"}>
        {items.length>0&&onExportCSV&&(
          <button onClick={onExportCSV} style={{...btn(),background:"rgba(255,255,255,0.15)",color:"white",border:"1px solid rgba(255,255,255,0.3)",fontSize:12}}>
            ⬇️ Exporter
          </button>
        )}
      </PageHeader>
      {items.length===0
        ?<div style={{...card,textAlign:"center",padding:40}}><div style={{fontSize:40,marginBottom:10}}>📭</div><div style={{color:"#94a3b8"}}>{empty}</div></div>
        :<div style={{display:"flex",flexDirection:"column",gap:10}}>{items.map((it,i)=>renderItem(it,i))}</div>
      }
    </div>
  );
}
