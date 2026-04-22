import DccTabs from "../../DccTabs.jsx";
import RepeatedTabs from "../../RepeatedTabs.jsx";
import CsvDownloadsPanel from "./CsvDownloadsPanel";
import VisualizationsPanel from "./VisualizationsPanel";


export default function RepeatedVisualizations() {
    
  return (
    <div>
      <DccTabs />
      <RepeatedTabs />
      <CsvDownloadsPanel />
<VisualizationsPanel />
    </div>
  )
}