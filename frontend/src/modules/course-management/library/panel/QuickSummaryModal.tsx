import { useEffect, useMemo, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkBreaks from "remark-breaks"
import remarkGfm from "remark-gfm"
import { Accordion } from "../../../../infra/shared/components/Accordion"
import { useLibrarySummaryStore } from "../store"
import { useShallow } from "zustand/react/shallow"

function MarkdownContent({ content }: { content: string }) {
    const codeBg = 'bg-black/10'
    const blockquoteBorder = 'border-current'

    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkBreaks]}
            components={{
                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                h1: ({ children }) => <h1 className="text-base font-bold mb-2">{children}</h1>,
                h2: ({ children }) => <h2 className="text-[15px] font-bold mb-2">{children}</h2>,
                h3: ({ children }) => <h3 className="text-[14px] font-bold mb-1.5">{children}</h3>,
                h4: ({ children }) => <h4 className="text-[13.5px] font-bold mb-1">{children}</h4>,
                ul: ({ children }) => <ul className="list-disc pl-5 mb-2">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal pl-5 mb-2">{children}</ol>,
                li: ({ children }) => <li className="mb-0.5">{children}</li>,
                code: ({ children, className }) => {
                    const isInline = !className
                    if (isInline) {
                        return (
                            <code className={`${codeBg} rounded px-1 py-0.5 text-[12px] font-mono`}>
                                {children}
                            </code>
                        )
                    }
                    return (
                        <pre className={`${codeBg} rounded p-2 overflow-x-auto mb-2`}>
                            <code className="text-[12px] font-mono">{children}</code>
                        </pre>
                    )
                },
                blockquote: ({ children }) => (
                    <blockquote className={`border-l-2 ${blockquoteBorder} pl-3 italic opacity-80 mb-2`}>
                        {children}
                    </blockquote>
                ),
                a: ({ children, href }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="underline">
                        {children}
                    </a>
                ),
                hr: () => <hr className="border-current opacity-30 my-2" />,
                table: ({ children }) => (
                    <table className="w-full text-left border-collapse mb-2 text-[12px]">{children}</table>
                ),
                thead: ({ children }) => <thead className="font-semibold">{children}</thead>,
                th: ({ children }) => (
                    <th className="border border-current/20 px-2 py-1">{children}</th>
                ),
                td: ({ children }) => (
                    <td className="border border-current/20 px-2 py-1">{children}</td>
                ),
            }}
        >
            {content}
        </ReactMarkdown>
    )
}


// interface SummaryProp {
//     overall_summary: string;
//     section_summary: string;
//     abbreviations: Array<{ abbr: string, meaning: string }>
// }

// const summary_plain: SummaryProp = {
//     overall_summary: "This document outlines a comprehensive aviation training curriculum designed to prepare students for both classroom instruction and practical flight operations. It starts with a thorough review of aircraft systems, teaching trainees to identify components, understand their functions, and respond to technical failures. The program then covers essential pre-flight tasks, including flight planning, weight and balance calculations, and equipment inspections. Students progress to hands-on flight training, mastering basic maneuvers like hovering, taxiing, and takeoffs under various weather conditions. A significant portion of the course focuses on emergency procedures, such as engine failures, autorotations, and managing degraded flight controls. Finally, the training addresses advanced navigation, tactical mission planning, and night vision operations to ensure pilots can safely handle complex real-world missions.",
//     section_summary: "The document outlines a structured aviation training curriculum divided into two modules: demonstrating knowledge of aircraft systems and conducting pre-mission tasks. Part 1 details instruction on 25 aircraft systems, requiring trainees to identify components, understand functions, and learn operational procedures or failure responses for systems including the airframe, flight controls, hydraulics, AFCS, drive train, fuel, electrical, avionics, engine, and specialized equipment like the Helmet Mounted Display, AVCS, IVHMS, and ESIS. It also covers MH-60M DAP limitations and UH-60M Blackhawk malfunction analysis. Part 2 focuses on pre-flight preparation, covering documentation review, Performance Planning Card (PPC) completion, weight and balance calculations, and flight planning for both Visual Flight Rules (VFR) and Instrument Flight Rules (IFR). It further details operating the Mission Planning System and inspecting Aviation Life Support Equipment (ALSE). This section outlines training objectives for aviation operations, covering pre-flight preparations, equipment operation, and flight maneuvers. It details procedures for operating Aviation Life Support Equipment (ALSE), conducting pre-flight inspections using the Operator Manual Checklist (OMCL) and completing DA Forms 2408-12/13, and participating in crew mission briefings. It also covers Forward Looking Infrared (FLIR) system operation, including navigation, focusing, boresighting, and target tracking. The core focuses on un-coupled aircraft operations, including cockpit knowledge, extended run-up and shutdown, hover power checks, ground taxiing, hovering flight, and Visual Meteorological Conditions (VMC) takeoffs, maneuvers, approaches, and go-arounds. Additionally, it addresses emergency responses, unusual attitude recovery, Inadvertent Instrument Meteorological Conditions (IIMC) procedures, airspace surveillance, radio communications, and fuel management verification. This section outlines standard operating and emergency procedures for aircraft crew, covering communications, fuel management, landing and takeoff maneuvers, avionics system operations, and emergency responses. It details radio communication protocols, fuel verification and balance operations, cold and hot refueling, and emergency egress steps. Landing and takeoff procedures specify roll-on landing and rolling takeoff requirements including speed limits, clearance maintenance, and control adjustments. Avionics operations cover the Flight Management System (FMS), Multi-Functional Display (MFD), IVHMS, Flight Director, hover symbology, and digital maps. Emergency procedures address engine failures at hover and altitude, DECU lockout, stabilator malfunctions, slope operations, autorotation, and degraded AFCS flight. Navigation techniques emphasize pilotage, dead reckoning, and external situational awareness. Part 4 of the flight training curriculum details operational procedures and emergency response protocols for aircraft pilots. It covers configuring hover symbology, operating digital maps, and managing the Flight Director Display Control Panel and Flight Management System (FMS). Navigation training includes electronically aided systems, pilotage, dead reckoning, and wind/drift adjustments. Practical flight operations encompass hover power checks, ground taxiing, hovering flight, VMC take-offs, traffic patterns, slope operations, roll-on landings, and go-arounds. Emergency management training covers general response, engine failure at hover and altitude, autorotation, and flying with a degraded Automatic Flight Control System (AFCS). Each objective specifies performance criteria, clearance maintenance, crew communication, and simulation or practical assessment methods. Part 5 outlines advanced helicopter flight training objectives divided into emergency/abnormal procedures and instrument flight tasks. Emergency procedures cover autorotation, degraded Automatic Flight Control System (AFCS) flight, Digital Engine Control Unit (DECU) lockout, stabilator malfunction, and rolling takeoffs, emphasizing malfunction identification, appropriate emergency actions, and strict adherence to operational limits. Instrument flight tasks detail maneuvers using primary instruments, the Standby Flight Instrument System (ESIS), Flight Director (FD) operations, instrument takeoffs, navigation, holding patterns, non-precision and precision approaches, unusual attitude recovery, Inadvertent IMC (IIMC) response, and Flight Management System (FMS)/Central Display Unit (CDU) operation. Across all tasks, pilots must maintain aircraft control within specified limits, focus appropriately on instruments or external references, announce altitude/course/airspeed changes, and acknowledge clearance reports. Part 6 outlines training standards for operating advanced aircraft navigation displays and executing tactical flight missions. It details procedures for the Flight Management System (FMS)/Central Display Unit (CDU), Multifunction Display (MFD), and Digital Map, covering system description, menu navigation, configuration, initialization, data interpretation, and emergency response. The section then covers tactical operations, including comprehensive mission planning (route selection, hazard plotting, fuel/weather assessment, risk evaluation, and briefings), tactical navigation (pilotage, dead reckoning, and electronic aids), and terrain flight execution (maintaining altitude, airspeed, trim, and clearance). Additional competencies include negotiating wire obstacles using charts and visual estimation, operating Night Vision Goggles (NVGs) from pre-flight checks to failure response, and participating in crew After Action Reviews (AAR) for mission evaluation.",
//     abbreviations: [
//         {
//             "abbr": "AFCS",
//             "meaning": "Explain the Automatic Flight Control System"
//         },
//         {
//             "abbr": "PPC",
//             "meaning": "Complete Performance Planning Card"
//         },
//         {
//             "abbr": "CG",
//             "meaning": "Establish mission/flight limitations imposed by weight or centre of gravity"
//         },
//         {
//             "abbr": "VFR",
//             "meaning": "Plan a Visual Flight Rules"
//         },
//         {
//             "abbr": "NOTAMS",
//             "meaning": "Check Notices to Airmen"
//         },
//         {
//             "abbr": "IFR",
//             "meaning": "Plan an Instrumented Flight Rules"
//         },
//         {
//             "abbr": "PCMCIA",
//             "meaning": "Load mission data to Personal Computer Memory Card International Association"
//         },
//         {
//             "abbr": "ALSE",
//             "meaning": "Operate Aviation Life Support Equipment"
//         },
//         {
//             "abbr": "OMCL",
//             "meaning": "Demonstrate pre-flight inspection using the Operator Manual Checklist"
//         },
//         {
//             "abbr": "UNCOUPLED",
//             "meaning": "Conduct Aircraft Operations"
//         },
//         {
//             "abbr": "VMC",
//             "meaning": "Demonstrate Visual Meteorological Conditions"
//         },
//         {
//             "abbr": "IIMC",
//             "meaning": "Demonstrate response to Inadvertent Instrument Meteorological Conditions"
//         },
//         {
//             "abbr": "FMS",
//             "meaning": "Demonstrate operation of the Flight Management System"
//         },
//         {
//             "abbr": "MFD",
//             "meaning": "Demonstrate operation of the Multi-Functional Display"
//         },
//         {
//             "abbr": "DECU",
//             "meaning": "Demonstrate procedure for Digital Engine Control Unit"
//         },
//         {
//             "abbr": "DCP",
//             "meaning": "Operate the FD/Display Control Panel"
//         },
//         {
//             "abbr": "AAR",
//             "meaning": "Demonstrate participation in crew level After Action Reviews"
//         },
//         {
//             "abbr": "COUPLED",
//             "meaning": "Conduct Aircraft Operations"
//         },
//         {
//             "abbr": "ESIS",
//             "meaning": "Perform flight manoeuvres using Standby Flight Instrument System"
//         },
//         {
//             "abbr": "FD",
//             "meaning": "Perform Flight Director"
//         },
//         {
//             "abbr": "IMC",
//             "meaning": "Announce transition to Instrument Meteorological Conditions"
//         },
//         {
//             "abbr": "ATC",
//             "meaning": "Maintain heading/course as required by departure procedure or Air Traffic Control"
//         },
//         {
//             "abbr": "DME",
//             "meaning": "Maintain the desired Distance Measuring Equipment"
//         },
//         {
//             "abbr": "CDU",
//             "meaning": "Central Display Unit"
//         },
//         {
//             "abbr": "FSCM",
//             "meaning": "Fire Support Coordination Measures"
//         },
//         {
//             "abbr": "ASE",
//             "meaning": "Aircraft Survivability Equipment"
//         }
//     ]
// }

// const summary_md: SummaryProp = {
//     overall_summary: 'This training document outlines a complete helicopter flight curriculum that starts with learning the functions and components of major aircraft systems like the airframe, hydraulics, avionics, and specialized equipment. Students will then practice essential pre-mission tasks, including flight planning, weight and balance calculations, documentation reviews, and pre-flight inspections. The course moves into hands-on flight training, covering basic maneuvers, visual and instrument approaches, and advanced navigation techniques. A major focus is placed on emergency procedures, such as handling engine failures, performing autorotations, and recovering from unusual attitudes or instrument conditions. Finally, the program teaches tactical operations like terrain flight and night vision use, while emphasizing clear crew communication and post-flight reviews to build safe, confident pilots.',
//     section_summary: `This section outlines a structured aviation training curriculum divided into two primary modules. **Module 1** focuses on demonstrating comprehensive knowledge of aircraft systems, covering the identification, functions, and operational procedures for the airframe, crew station, flight controls, hydraulic, AFCS, drive train/rotor, fuel, electrical, auxiliary, data transfer, avionics, engine, and specialized systems like the Helmet Mounted Display, FLIR, AVCS, IVHMS, and reversionary/standby instruments. It also addresses system limitations for the MH-60M DAP, malfunction analysis for the UH-60M Blackhawk, and required corrective actions. **Module 2** covers pre-mission tasks, including reviewing aircraft documentation and flight rules, completing Performance Planning Cards, conducting weight and balance calculations (including Form 365-4), and planning both VFR and IFR flights using weather, NOTAMS, charts, and regulatory guidelines. It also details operating the Mission Planning System for route, tactical, and communication data entry, loading data to PCMCIA, and performing inspections on Aviation Life Support Equipment (ALSE). **Ground Preparation & Equipment Operations**\n- Operate Aviation Life Support Equipment (ALSE), including inspection, correct usage, and passenger briefing/assistance.\n- Perform pre-flight inspections using the Operator Manual Checklist (OMCL), complete DA Forms 2408-12 and 2408-13/13-1, and report aircraft faults.\n- Participate in crew mission briefings by collecting information, preparing materials, and conducting the brief.\n- Demonstrate Forward Looking Infrared Radar (FLIR) operation, including power-on, menu navigation, focusing, ground/air boresighting, target location/saving, and operating LD, LP, and LST.\n\n**Un-coupled Aircraft Flight Operations**\n- Demonstrate cockpit knowledge by identifying and operating cockpit components.\n- Execute extended run-up and shutdown procedures using OMCL, complete documentation/logbooks, and manage crew announcements and reports.\n- Perform hover power checks, including capability determination, limitation checks, CG verification, PPC comparison, and landing.\n- Demonstrate ground taxi procedures, including before-taxi checks, clearance verification, brake release, tail wheel setting, and external focus.\n- Execute hovering flight maneuvers, including takeoff to hover, hovering turns, and landing from hover while maintaining clearance and external focus.\n- Conduct Visual Meteorological Conditions (VMC) takeoffs from ground or hover, maintaining clearance and announcing intentions.\n- Perform VMC flight maneuvers, maintaining airspeed, course, heading, climb/descent rates, trim, and traffic pattern operations.\n- Execute VMC approaches to hover or surface, including go-around procedures.\n- Respond to emergencies by flying the aircraft, analyzing information, identifying the emergency, and executing appropriate procedures.\n- Recover from unusual attitudes by leveling wings, maintaining heading, adjusting torque/trim/airspeed, and staying within operating limitations.\n- Respond to Inadvertent Instrument Meteorological Conditions (IIMC) by initiating immediate climb, adjusting flight parameters, selecting SOS/Guard, and conducting ATC communications.\n- Conduct airspace surveillance by briefing procedures, announcing maneuvers, and recognizing/announcing hazards using clock positions, distance, and altitude.\n- Demonstrate radio communication procedures, including radio discipline, tactical/non-tactical/internal terminology, and proper communication execution.\n- Verify fuel requirements as part of fuel management procedures. This section outlines operational, emergency, and systems management procedures for aircraft crew. Key areas include **crew hazard recognition** and communication using clock positions, distance, and altitude. **Radio communications** cover discipline, terminology, and tactical/non-tactical/internal protocols. **Fuel management and refueling** involve requirement verification, consumption monitoring, balance operations, and cold/hot refueling. **Emergency procedures** address aircraft egress, shutdown, marshalling, and specific responses to engine failures at hover or altitude, DECU lockout, stabilator malfunction, and degraded AFCS. **Flight maneuvers** encompass roll-on landing, rolling takeoff, slope operations, and autorotation, emphasizing clearance maintenance, power management, and controlled touchdown or ascent. **Avionics and systems** include the Flight Management System (FMS), Multi-Functional Display (MFD), IVHMS, Flight Director, hover symbology, and digital map navigation. **Navigation techniques** focus on pilotage, dead reckoning, and adjusting for environmental factors like wind and drift. All procedures require strict adherence to aircraft limitations, proper system configuration, and clear crew communication. Part 4 outlines advanced aircraft training objectives focusing on systems operation, navigation, flight maneuvers, and emergency procedures.\n\n**Systems & Navigation:**\n- Configure hover symbology for head-down operations\n- Load and operate digital maps via MFD\n- Activate, test, program, and operate electronically aided navigation\n- Program Flight Management System (FMS) and Flight Director Display Control Panel\n- Utilize IVHMS for data checks, crew changes, and vibration data capture\n- Participate in crew After Action Reviews (AAR)\n\n**Flight Operations:**\n- Conduct hover power checks, ground taxiing, hovering flight, and VMC take-offs\n- Execute VMC manoeuvres, slope operations, roll-on landings, and go-arounds\n- Navigate using pilotage, dead reckoning, wind/drift adjustments, and ground speed checks\n\n**Emergency Procedures:**\n- Analyze information and identify malfunctions\n- Respond to engine failures at hover (smooth descent, zero drift touchdown) and altitude (checklist execution, control maintenance)\n- Perform autorotation (maintain RPM, select landing area, decelerate)\n- Fly with degraded Automatic Flight Control System (AFCS) using VMC approach\n\nAll exercises mandate maintaining aircraft clearance, announcing intentions, and adhering to operational limitations. Part 5 outlines advanced helicopter flight training objectives divided into emergency/abnormal procedures and instrument flight tasks. Emergency procedures cover autorotation, degraded Automatic Flight Control System (AFCS) flight, Digital Engine Control Unit (DECU) lockout, stabilator malfunction, and rolling takeoffs, emphasizing malfunction identification, appropriate emergency actions, and strict adherence to operational limits (RPM, torque, hover/surface termination, and placard limits). Instrument flight tasks detail maneuvers using primary instruments, the Standby Flight Instrument System (ESIS), and the Flight Director (FD) with Flight Management System (FMS) integration. It also covers instrument take-offs, instrument navigation using inertial systems and NAVAIDs, holding patterns, non-precision and precision approaches, unusual attitude recovery, and responses to Inadvertent Instrument Meteorological Conditions (IIMC). Finally, it includes operating and troubleshooting the FMS/Central Display Unit (CDU). All tasks require precise aircraft control, instrument focus, ATC communication, and adherence to specified procedures and limitations. Aviation Systems & Tactical Operations Training Standards\n\n**Aviation Systems Operation (Lessons 5.11–5.13)**\n- **FMS/CDU:** Navigate menus, configure for mission, initialize, interpret data, and execute emergency procedures.\n- **MFD:** Navigate menus, interpret operational data, configure, and initialize.\n- **Digital Map:** Navigate menus, load data via transfer system, select maps via MFD, and analyze terrain/mission data.\n\n**Tactical Operations (Lesson 6)**\n- **Mission Planning (6.1):** Utilize planning documents, analyze mission factors, plot hazards, select routes/terrain modes, apply weapons/FSCM/threat/ASE data, calculate parameters/fuel, evaluate weather, conduct risk assessments, and lead briefings.\n- **Tactical Navigation (6.2):** Apply pilotage, dead reckoning, and electronically aided navigation techniques.\n- **Terrain Flight Navigation & Execution (6.3–6.4):** Maintain appropriate altitude, airspeed, and trim during contour/low-level flight while ensuring aircraft clearance.\n- **Wire Obstacle Negotiation (6.5):** Locate obstacles, estimate height, determine maneuvers, and announce intentions using planning charts.\n- **Night Vision Goggles (NVGs) (6.6):** Perform pre-flight checks, diagnose faults, mount/adjust, operate aircraft, store equipment, and respond to failures.\n- **After Action Review (AAR) (6.7):** Identify performance points, review checklists, and participate in crew debriefings.\n\n**Standard Communication Protocols**\n- Announce all changes to altitude, course, and airspeed.\n- Acknowledge all clearance reports across every operational phase.`,
//     abbreviations: [
//         {
//             "abbr": "AFCS",
//             "meaning": "Explain the Automatic Flight Control System"
//         },
//         {
//             "abbr": "PPC",
//             "meaning": "Complete Performance Planning Card"
//         },
//         {
//             "abbr": "CG",
//             "meaning": "Establish mission/flight limitations imposed by weight or centre of gravity"
//         },
//         {
//             "abbr": "VFR",
//             "meaning": "Plan a Visual Flight Rules"
//         },
//         {
//             "abbr": "NOTAMS",
//             "meaning": "Check Notices to Airmen"
//         },
//         {
//             "abbr": "IFR",
//             "meaning": "Plan an Instrumented Flight Rules"
//         },
//         {
//             "abbr": "PCMCIA",
//             "meaning": "Load mission data to Personal Computer Memory Card International Association"
//         },
//         {
//             "abbr": "ALSE",
//             "meaning": "Operate Aviation Life Support Equipment"
//         },
//         {
//             "abbr": "OMCL",
//             "meaning": "Demonstrate pre-flight inspection using the Operator Manual Checklist"
//         },
//         {
//             "abbr": "UNCOUPLED",
//             "meaning": "Conduct Aircraft Operations"
//         },
//         {
//             "abbr": "VMC",
//             "meaning": "Demonstrate Visual Meteorological Conditions"
//         },
//         {
//             "abbr": "IIMC",
//             "meaning": "Demonstrate response to Inadvertent Instrument Meteorological Conditions"
//         },
//         {
//             "abbr": "FMS",
//             "meaning": "Demonstrate operation of the Flight Management System"
//         },
//         {
//             "abbr": "MFD",
//             "meaning": "Demonstrate operation of the Multi-Functional Display"
//         },
//         {
//             "abbr": "DECU",
//             "meaning": "Demonstrate procedure for Digital Engine Control Unit"
//         },
//         {
//             "abbr": "DCP",
//             "meaning": "Operate the FD/Display Control Panel"
//         },
//         {
//             "abbr": "AAR",
//             "meaning": "Demonstrate participation in crew level After Action Reviews"
//         },
//         {
//             "abbr": "COUPLED",
//             "meaning": "Conduct Aircraft Operations"
//         },
//         {
//             "abbr": "ESIS",
//             "meaning": "Perform flight manoeuvres using Standby Flight Instrument System"
//         },
//         {
//             "abbr": "FD",
//             "meaning": "Perform Flight Director"
//         },
//         {
//             "abbr": "IMC",
//             "meaning": "Announce transition to Instrument Meteorological Conditions"
//         },
//         {
//             "abbr": "ATC",
//             "meaning": "Maintain heading/course as required by departure procedure or Air Traffic Control"
//         },
//         {
//             "abbr": "DME",
//             "meaning": "Maintain the desired Distance Measuring Equipment"
//         },
//         {
//             "abbr": "CDU",
//             "meaning": "Central Display Unit"
//         },
//         {
//             "abbr": "FSCM",
//             "meaning": "Fire Support Coordination Measures"
//         },
//         {
//             "abbr": "ASE",
//             "meaning": "Aircraft Survivability Equipment"
//         }
//     ]
// }

export function QuickSummaryPanel() {
    // const summary: SummaryProp = summary_md
    const { summary } = useLibrarySummaryStore(useShallow(s => ({ summary: s.summary })))
    type ItemType = {
        id: string;
        title: string;
        content?: React.ReactNode;
        contentFn?: () => React.ReactNode;
    }
    type SectionType = {
        pages: [string]
        section_title: string
        covered_points: [string]
        section_summary: string
    }

    const items = useMemo(() => {
        if (!summary) return []

        const sections: Array<ItemType> = (summary.sections! as [SectionType]).map((s, idx) => {
            const covered_points = s.covered_points.map(cp => (`- ${cp}`)).join('\n')
            let content = s.section_summary
            if (covered_points && covered_points.length > 0) {
                content = `${content}
                
# Covered Points:
${covered_points}`
            }
            return {
                id: `section_${idx + 1}`,
                title: s.section_title ? `${idx + 1}. ${s.section_title}` : `Section Summary`,
                content: undefined,
                contentFn: () => (<MarkdownContent content={content} />),
            }
        }
        ) as Array<ItemType>

        return [
            {
                id: 'overall_1',
                title: 'Overall Summary',
                content: undefined,
                contentFn: () => <MarkdownContent content={summary.overall_summary!} />
            },
            ...(sections!),
            {
                id: '3',
                title: 'Abbreviations',
                content: undefined,
                contentFn: () => (
                    <div className="overflow-y-auto flex-1 flex flex-col">
                        <div className="grid grid-cols-2 gap-2 border-none">
                            {summary.abbreviations!.map((item) => (
                                <div key={item.abbr} className="p-3 border-none">
                                    <span className="font-semibold text-blue-600">{item.abbr}</span>
                                    <p className="mt-1 text-gray-700">{item.meaning}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )
            }
        ]

    }, [summary]);
    return (
        <div className="w-full overflow-y-auto bg-surface">
            {/* Body */}
            <div className="p-6 flex-1 gap-4 flex flex-col">
                <Accordion
                    expandedIndex={0}
                    items={items}
                />
            </div>
        </div>
    )
}

// export default function QuickSummaryModal({ onClose }: { onClose: () => void }) {
//     const summary: SummaryProp = summary_md
//     return (
//         <div
//             className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
//             onClick={onClose}
//         >
//             <div
//                 className="bg-surface rounded-2xl border border-bd shadow-elevated w-[90%] max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
//                 onClick={(e) => e.stopPropagation()}
//             >
//                 {/* Header */}
//                 <div
//                     className="px-6 py-4 flex items-center justify-between shrink-0"
//                     style={{ background: 'linear-gradient(135deg, var(--navy) 0%, var(--navy-mid) 100%)' }}
//                 >
//                     <div>
//                         <p className="text-[13px] font-bold text-white">Quick Summary</p>
//                     </div>
//                     <button
//                         type="button"
//                         onClick={onClose}
//                         className="text-white/50 hover:text-white text-xl leading-none border-none bg-transparent cursor-pointer"
//                     >
//                         &times;
//                     </button>
//                 </div>

//                 {/* Body */}
//                 <div className="p-6 overflow-y-auto flex-1 gap-4 flex flex-col">
//                     <div>
//                         <h3 className='font-bold mb-2'>Overall Summary</h3>
//                         <MarkdownContent content={summary.overall_summary} />
//                     </div>
//                     <div>
//                         <h3 className='font-bold mb-2'>Section Summary</h3>
//                         <MarkdownContent content={summary.section_summary} />
//                     </div>
//                 </div>

//                 {/* Footer */}
//                 <div className="px-6 py-4 flex justify-end gap-2 border-t border-bd shrink-0">
//                     <button
//                         type="button"
//                         onClick={onClose}
//                         className="px-4 py-2 rounded-[9px] text-sm font-semibold text-secondary bg-surface-2 border border-bd hover:bg-surface transition-colors cursor-pointer font-sans"
//                     >
//                         Close
//                     </button>
//                 </div>
//             </div>
//         </div>
//     )
// }