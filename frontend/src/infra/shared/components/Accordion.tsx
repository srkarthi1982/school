import { useState } from "react";

interface AccordionItemProps {
    title: string;
    content?: React.ReactNode;
    contentFn?: () => React.ReactNode;
    isOpen: boolean;
    onClick: () => void;
    id: string;
}

const AccordionItem: React.FC<AccordionItemProps> = ({ title, content, contentFn, isOpen, onClick, id }) => {
    return (
        <div className="border-b border-slate-200 last:border-b-0 pb-[1px] last:pb-0">
            <button
                type="button"
                className="w-full flex justify-between items-center p-3 bg-[var(--accent-light)] hover:bg-slate-100 transition-colors duration-200 text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                onClick={onClick}
                aria-expanded={isOpen}
                aria-controls={`${id}-content`}
                id={`${id}-header`}
            >
                <span className="text-sm font-bold text-primary">{title}</span>
                <span
                    className={`transform transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                >
                    ▼
                </span>
            </button>
            <div
                id={`${id}-content`}
                role="region"
                aria-labelledby={`${id}-header`}
                className={`overflow-auto transition-all duration-300 ease-in-out ${isOpen ? 'max-h-[calc(100vh-259px)] p-5' : 'max-h-0 p-0'}`}
            >
                {isOpen ? (contentFn ? contentFn() : content) : null}
            </div>
        </div>
    );
};



interface AccordionProps {
    items: Array<{
        id: string;
        title: string;
        content?: React.ReactNode;
        contentFn?: () => React.ReactNode;
    }>;
    expandedIndex?: number;
}

export const Accordion: React.FC<AccordionProps> = ({ items, expandedIndex }) => {
    const [_expandedIndex, setExpandedIndex] = useState<number | null | undefined>(expandedIndex);

    const handleToggle = (index: number) => {
        setExpandedIndex(prev => (prev === index ? null : index));
    };

    return (
        <div className="w-full mx-auto border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-[var(--surface-2)]">
            {items.map((item, index) => (
                <AccordionItem
                    key={item.id}
                    id={item.id}
                    title={item.title}
                    // content={item.content}
                    contentFn={item.contentFn}
                    isOpen={_expandedIndex === index}
                    onClick={() => handleToggle(index)}
                />
            ))}
        </div>
    );
};
