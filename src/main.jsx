import React,{lazy,Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import Runtime from './saas/SaaSApp.jsx';
import {AppearanceProvider} from './Appearance.jsx';
import {initializeAppearance} from './appearance.js';
import {Loading} from './saas/components.jsx';
import './styles.css';
import './lavender.css';
import './periwinkle.css';
import './themes.css';
import './readability.css';
import './dashboard-compact.css';
const VenueWorkspace=lazy(()=>import('./Workspace.jsx'));
function Workspace(props){return <Suspense fallback={<Loading/>}><VenueWorkspace {...props}/></Suspense>;}
initializeAppearance();
createRoot(document.getElementById('root')).render(<AppearanceProvider><Runtime Workspace={Workspace}/></AppearanceProvider>);
