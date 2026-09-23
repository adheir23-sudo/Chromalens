import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import MediaPreview from "../components/MediaPreview";
import TechnicalPanel from "../components/TechnicalPanel";
import ColorGradingPanel from "../components/ColorGradingPanel";
import { ArrowLeft } from "lucide-react";

export default function AnalysisDetailPage() {
  const { id } = useParams();
  const [record, setRecord] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancel = false;
    api
      .get(`/analyses/${id}`)
      .then(({ data }) => !cancel && setRecord(data))
      .catch((e) => !cancel && setErr(e?.response?.data?.detail || "Not found"));
    return () => {
      cancel = true;
    };
  }, [id]);

  if (err) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-8 pt-28 pb-24">
        <div className="cl-card p-10 text-center">
          <p className="text-slate-300">{err}</p>
          <Link to="/gallery" className="text-amber-400 hover:text-amber-300 mt-3 inline-block">
            ← Back to gallery
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 pt-24 pb-24">
      <Link
        to="/gallery"
        className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-amber-300 mb-6 transition-colors"
        data-testid="back-to-gallery"
      >
        <ArrowLeft size={14} /> Back to gallery
      </Link>

      {!record ? (
        <div className="cl-card aspect-video cl-pulse" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
          <div className="lg:col-span-7">
            <MediaPreview record={record} />
          </div>
          <div className="lg:col-span-5">
            <TechnicalPanel technical={record.analysis?.technical} />
          </div>
          <div className="lg:col-span-12">
            <ColorGradingPanel analysis={record.analysis} analysisId={record.id} />
          </div>
        </div>
      )}
    </div>
  );
}
