import {HiOutlinePencilSquare} from 'react-icons/hi2'

export default function AssignmentAssessmentDefaultPage() {
    const quizes = [
        {id:1, quiz_name: 'Quiz 1', type: 'Multiple Choices'},
        {id:2, quiz_name: 'Quiz 2', type: 'Essay'},
        {id:3, quiz_name: 'Quiz 3', type: 'Mixed'}
    ]
    return(<div>
        <div>
            <div className="card p-0 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                        <thead>
                        <tr className="border-b border-bd" style={{background: 'var(--navy)'}}>
                            {['ID', 'Quiz Name', 'Type', 'Actions'].map((h) => (
                                <th key={h}
                                    className="px-4 py-3 text-start text-[11px] font-bold text-white/60 uppercase tracking-[0.06em]">
                                    {h}
                                </th>
                            ))}
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-bd">
                        {quizes.map((u) => (
                            <tr key={u.id} className="hover:bg-surface-2 transition-colors duration-100">
                                <td className="px-4 py-3 text-sm text-muted" style={{width:150}}>{u.id}</td>
                                <td className="px-4 py-3 text-sm font-semibold text-primary">{u.quiz_name}</td>
                                <td className="px-4 py-3 text-sm font-semibold text-primary">{u.type}</td>
                                <td className="px-4 py-3">
                                    <button
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[7px] text-xs font-semibold bg-accent text-white hover:opacity-90 transition-opacity border-none cursor-pointer font-sans"
                                        onClick={() => null}
                                    >
                                        <HiOutlinePencilSquare className="text-[13px]"/>
                                        Edit
                                    </button>
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
    )
}