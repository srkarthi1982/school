import React, { memo } from "react";
import { AttendanceStatusResponse } from "../../../api/generated";

export const Status = memo(function Status({attendanceStatusList} : {attendanceStatusList: AttendanceStatusResponse[] }): React.ReactElement {
    return (
        <ul className="flex gap-3 flex-wrap" role="list">            
            {
                attendanceStatusList.map(x => (
                    <li key={x.id} className="flex items-center gap-1.5" role="listitem">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: x.color || 'var(--text-muted)' }} />
                    <span className="text-xs text-muted">{x.name}</span>
                </li>
                ))
            }
        </ul>
    );
});