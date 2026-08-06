import GandiBloom from './GandiBloom';
import GandiComics from './GandiComics';
import GandiFilm from './GandiFilm';
import GandiGlitch from './GandiGlitch';
import GandiShadow from './GandiShadow';
import GandiShake from './GandiShake';
import GandiShockWave from './GandiShockWave';
import GandiSync from './GandiSync';

/**
 * @author LK
 * Loader for Gandi shader classes.
 */
class GandiShaderLoader {
    // Only listed shaders will be available on page
    static SHADER_LIST: Record<string, any> = {
        'GandiBloom': GandiBloom,
        'GandiComics': GandiComics,
        'GandiFilm': GandiFilm,
        'GandiGlitch': GandiGlitch,
        'GandiShadow': GandiShadow,
        'GandiShake': GandiShake,
        'GandiShockWave': GandiShockWave,
        'GandiSync': GandiSync
    };
}

export default GandiShaderLoader;
