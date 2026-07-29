const acronymData = [
    {
        "abbr": "AFCS",
        "meaning": "Explain the Automatic Flight Control System"
    },
    {
        "abbr": "PPC",
        "meaning": "Complete Performance Planning Card"
    },
    {
        "abbr": "CG",
        "meaning": "Establish mission/flight limitations imposed by weight or centre of gravity"
    },
    {
        "abbr": "VFR",
        "meaning": "Plan a Visual Flight Rules"
    },
    {
        "abbr": "NOTAMS",
        "meaning": "Check Notices to Airmen"
    },
    {
        "abbr": "IFR",
        "meaning": "Plan an Instrumented Flight Rules"
    },
    {
        "abbr": "PCMCIA",
        "meaning": "Load mission data to Personal Computer Memory Card International Association"
    },
    {
        "abbr": "ALSE",
        "meaning": "Operate Aviation Life Support Equipment"
    },
    {
        "abbr": "OMCL",
        "meaning": "Demonstrate pre-flight inspection using the Operator Manual Checklist"
    },
    {
        "abbr": "UNCOUPLED",
        "meaning": "Conduct Aircraft Operations"
    },
    {
        "abbr": "VMC",
        "meaning": "Demonstrate Visual Meteorological Conditions"
    },
    {
        "abbr": "IIMC",
        "meaning": "Demonstrate response to Inadvertent Instrument Meteorological Conditions"
    },
    {
        "abbr": "FMS",
        "meaning": "Demonstrate operation of the Flight Management System"
    },
    {
        "abbr": "MFD",
        "meaning": "Demonstrate operation of the Multi-Functional Display"
    },
    {
        "abbr": "DECU",
        "meaning": "Demonstrate procedure for Digital Engine Control Unit"
    },
    {
        "abbr": "DCP",
        "meaning": "Operate the FD/Display Control Panel"
    },
    {
        "abbr": "AAR",
        "meaning": "Demonstrate participation in crew level After Action Reviews"
    },
    {
        "abbr": "COUPLED",
        "meaning": "Conduct Aircraft Operations"
    },
    {
        "abbr": "ESIS",
        "meaning": "Perform flight manoeuvres using Standby Flight Instrument System"
    },
    {
        "abbr": "FD",
        "meaning": "Perform Flight Director"
    },
    {
        "abbr": "IMC",
        "meaning": "Announce transition to Instrument Meteorological Conditions"
    },
    {
        "abbr": "ATC",
        "meaning": "Maintain heading/course as required by departure procedure or Air Traffic Control"
    },
    {
        "abbr": "DME",
        "meaning": "Maintain the desired Distance Measuring Equipment"
    },
    {
        "abbr": "CDU",
        "meaning": "Central Display Unit"
    },
    {
        "abbr": "FSCM",
        "meaning": "Fire Support Coordination Measures"
    },
    {
        "abbr": "ASE",
        "meaning": "Aircraft Survivability Equipment"
    }
]

export default function VocabularyModal({ onClose }: { onClose: () => void }) {
    return (
        <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={onClose}
        >
            <div
                className="bg-surface rounded-2xl border border-bd shadow-elevated w-[90%] max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div
                    className="px-6 py-4 flex items-center justify-between shrink-0"
                    style={{ background: 'linear-gradient(135deg, var(--navy) 0%, var(--navy-mid) 100%)' }}
                >
                    <div>
                        <p className="text-[13px] font-bold text-white">Vocabulary</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-white/50 hover:text-white text-xl leading-none border-none bg-transparent cursor-pointer"
                    >
                        &times;
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto flex-1 gap-4 flex flex-col">
                    <div className="grid grid-cols-2 gap-4 border-none">
                        {acronymData.map((item) => (
                            <div key={item.abbr} className="p-4 border-none">
                                <span className="font-semibold text-blue-600">{item.abbr}</span>
                                <p className="mt-1 text-gray-700">{item.meaning}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 flex justify-end gap-2 border-t border-bd shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-[9px] text-sm font-semibold text-secondary bg-surface-2 border border-bd hover:bg-surface transition-colors cursor-pointer font-sans"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    )
}