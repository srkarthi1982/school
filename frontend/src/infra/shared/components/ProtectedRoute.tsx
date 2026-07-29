import {useEffect, useState} from 'react'
import {Navigate} from 'react-router-dom'
import type {ReactNode} from 'react'
import useAuthStore, {selectLoading, selectIsAuthenticated} from '../../auth/useAuthStore'
import LoginPage from "../../auth/LoginPage.tsx";

interface ProtectedRouteProps {
    children: ReactNode
}

export default function ProtectedRoute({children}: ProtectedRouteProps) {
    const isAuthenticated = useAuthStore(selectIsAuthenticated)
    const loading = useAuthStore(selectLoading)


    const showLogin = !loading && !isAuthenticated
    return (
        <div style={{position: 'relative', width: '100%', height: '100%', background: 'var(--accent)',display: loading ?'none':'block',}}>
            <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%'
            }}>
                <LoginPage/>
            </div>
            <div style={{
                clipPath: showLogin ? 'circle(0% at 50% 50%)' : 'circle(150% at 50% 50%)',
                transition: 'clip-path 1s ease-in-out',
            }}>
                <div>{children}</div>
            </div>
        </div>
    )
}
