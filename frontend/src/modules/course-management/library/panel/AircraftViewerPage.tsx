import { useEffect, useState } from 'react';
import { HiOutlineArrowLeft, HiOutlineExclamationCircle } from 'react-icons/hi2';
import { useNavigate, useParams } from 'react-router-dom';
import { client } from '../../../../api/client';
import useFullBleedStore from '../../../../infra/shared/store/useFullBleedStore';

type LaunchResponse = {
    material_id: number;
    title: string;
    viewer_url: string;
};

export default function AircraftViewerPage() {
    const { materialId } = useParams<{ materialId: string }>();
    const navigate = useNavigate();
    const setFullBleed = useFullBleedStore((state) => state.setFullBleed);
    const [launch, setLaunch] = useState<LaunchResponse | null>(null);
    const [error, setError] = useState('');
    const [frameLoaded, setFrameLoaded] = useState(false);

    useEffect(() => {
        setFullBleed(true);
        return () => setFullBleed(false);
    }, [setFullBleed]);

    useEffect(() => {
        const id = Number(materialId);
        if (!Number.isInteger(id) || id <= 0) {
            setError('This Aircraft Viewer link is invalid.');
            return;
        }
        let cancelled = false;
        void client.get({
            url: `/api/v1/library/aircraft-viewer/${id}`,
            credentials: 'include',
        }).then(({ data, error: apiError }) => {
            if (cancelled) return;
            if (apiError || !data) {
                setError('The Aircraft Viewer is unavailable or you do not have access.');
                return;
            }
            setLaunch(data as LaunchResponse);
        }).catch(() => {
            if (!cancelled) setError('The Aircraft Viewer could not be loaded.');
        });
        return () => { cancelled = true; };
    }, [materialId]);

    return (
        <div className="h-full min-h-0 w-full min-w-0 flex flex-col bg-surface">
            <header className="shrink-0 flex items-center gap-3 border-b border-bd bg-surface px-4 py-3">
                <button
                    onClick={() => navigate('/course-management/library?type=general')}
                    className="inline-flex items-center gap-2 rounded-xl border border-bd px-3 py-2 text-sm font-semibold text-primary hover:border-accent hover:text-accent"
                >
                    <HiOutlineArrowLeft className="text-[18px]" />
                    Back to General Library
                </button>
                <h1 className="truncate text-base font-semibold text-primary">
                    {launch?.title || 'Aircraft Viewer'}
                </h1>
            </header>
            <main className="relative flex-1 min-h-0 min-w-0">
                {!launch && !error && (
                    <div className="absolute inset-0 grid place-items-center text-sm text-secondary">
                        Preparing Aircraft Viewer…
                    </div>
                )}
                {error && (
                    <div className="absolute inset-0 flex items-center justify-center gap-2 p-6 text-danger">
                        <HiOutlineExclamationCircle className="text-2xl" />
                        <span>{error}</span>
                    </div>
                )}
                {launch && (
                    <>
                        {!frameLoaded && (
                            <div className="absolute inset-0 grid place-items-center text-sm text-secondary">
                                Loading viewer package…
                            </div>
                        )}
                        <iframe
                            src={launch.viewer_url}
                            title="Aircraft Viewer"
                            sandbox="allow-scripts allow-same-origin"
                            allow="fullscreen"
                            onLoad={() => setFrameLoaded(true)}
                            onError={() => setError('The Aircraft Viewer page failed to load.')}
                            className="block h-full w-full border-0 bg-surface"
                        />
                    </>
                )}
            </main>
        </div>
    );
}
