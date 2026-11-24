import { registerRootComponent } from 'expo';

// La tâche de suivi GPS doit être définie dès le chargement du paquet : le
// système peut lancer l'application en arrière-plan, sans interface.
import './src/tracking/task';

import App from './App';

registerRootComponent(App);
