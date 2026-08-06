// @ts-ignore
import Spine from './spine_runtime/spine-webgl';
import RenderConstants from './RenderConstants';

/**
 * @author LK
 * Manages Spine animation playback and rendering.
 *
 * TypeScript counterpart of the original `SpineManager.js`. It owns the Spine
 * scene renderer, time keeper, asset manager and the set of skeletons that are
 * currently animating. The renderer drives it through `updateTime()`,
 * `isDirty()` and `rendererSkeleton()`.
 */
class SpineManager {
    scratchRender: any;
    gl: WebGLRenderingContext;
    renderer: any;
    timeKeeper: any;
    assetManager: any;
    drawDebug: boolean;
    jsonCache: Record<string, any>;
    atlasCache: Record<string, any>;
    runningSkeleton: Set<any>;
    frameCall: any;
    _size: [number, number];
    private onNativeSizeChangedBound: any;

    constructor (scratchRender: any, gl: WebGLRenderingContext, assetHost?: string) {
        this.scratchRender = scratchRender;
        this.gl = gl;
        this.renderer = new Spine.SceneRenderer(gl.canvas, gl);
        this.timeKeeper = new Spine.TimeKeeper();
        this.assetManager = new Spine.AssetManager(gl, assetHost);
        this.drawDebug = false;
        this.jsonCache = {};
        this.atlasCache = {};

        this._size = [0, 0];
        this.onNativeSizeChangedBound = this.onNativeSizeChanged.bind(this);
        if (scratchRender && typeof scratchRender.on === 'function') {
            scratchRender.on(RenderConstants.Events.NativeSizeChanged, this.onNativeSizeChangedBound);
        }
        this.runningSkeleton = new Set();
        this.frameCall = null;
    }

    isDirty (): boolean {
        return this.runningSkeleton.size > 0;
    }

    onNativeSizeChanged (event: any): void {
        if (event && event.newSize) {
            this.onResize(event.newSize);
        }
    }

    getNativeSize (): [number, number] {
        return this._size;
    }

    onResize (nativeSize: [number, number]): void {
        const [width, height] = nativeSize;

        // tw: do not resize if new size === old size
        if (this._size && this._size[0] === width && this._size[1] === height) {
            return;
        }

        this._size = nativeSize;
        const renderer = this.renderer;
        const viewportWidth = width;
        const viewportHeight = height;
        if (renderer && renderer.camera) {
            renderer.camera.position.x = viewportWidth / 2;
            renderer.camera.position.y = viewportHeight / 2;
            renderer.camera.setViewport(viewportWidth, viewportHeight);
        }
    }

    isMultiSkeleton (skeletonJSONObj: any): boolean {
        const skeletonObjectKeys = ['skeleton', 'bones', 'skins', 'animations'];
        return !!skeletonObjectKeys.find(key => !skeletonJSONObj[key]);
    }

    getAtlasFileByJSONFile (jsonFile: string): string | undefined {
        return this.atlasCache[jsonFile];
    }

    loadAtlasAndJson (atlasKey: string, jsonFile: string): Promise<[void, any]> {
        const loadTextureAtlas = new Promise<void>((resolve, reject) => {
            const success = () => resolve();
            const error = (path: string, message: string) => {
                console.error('loadSpineAsset error', path);
                console.error('                    ', message);
                reject(message);
            };
            this.assetManager.loadTextureAtlas(atlasKey, success, error);
        }).catch(e => {
            console.log(e);
        });

        const loadJson = new Promise((resolve, reject) => {
            const success = (path: string) => {
                this.atlasCache[jsonFile] = atlasKey;
                resolve(this.assetManager.require(jsonFile));
            };
            const error = (path: string, message: string) => {
                console.error('loadSpineAsset error', path);
                console.error('                    ', message);
                reject(message);
            };
            this.assetManager.loadJson(jsonFile, success, error);
        }).catch(e => {
            console.log(e);
        });
        return Promise.all([loadTextureAtlas, loadJson]) as Promise<[void, any]>;
    }

    getSkeletonNamesForJSON (jsonFile: string): string[] | null {
        if (!jsonFile) return null;
        let skeletonJSONObj = this.jsonCache[jsonFile];
        if (!skeletonJSONObj) {
            skeletonJSONObj = this.assetManager.require(jsonFile);
            this.jsonCache[jsonFile] = skeletonJSONObj;
        }
        if (!skeletonJSONObj) {
            console.warn(`Gandi: skeleton json file not loaded - ${jsonFile}`);
            return null;
        }
        if (this.isMultiSkeleton(skeletonJSONObj)) {
            return Object.keys(skeletonJSONObj);
        }
        return [jsonFile];
    }

    async createSkeleton (atlasKey: string, jsonFile: string, skeletonName?: string): Promise<any | null> {
        await this.loadAtlasAndJson(atlasKey, jsonFile);

        const atlas = this.assetManager.require(atlasKey);
        if (!atlas) {
            console.warn(`Gandi: skeleton atlas data not loaded - ${atlasKey}`);
            return null;
        }

        let skeletonJSONObj = this.jsonCache[jsonFile];
        if (!skeletonJSONObj) {
            skeletonJSONObj = this.assetManager.require(jsonFile);
        }

        if (!skeletonJSONObj) {
            console.warn(`Gandi: skeleton json file not loaded - ${jsonFile}`);
            return null;
        }

        const atlasLoader = new Spine.AtlasAttachmentLoader(atlas);
        const skeletonLoader = new Spine.SkeletonJson(atlasLoader);

        const isMultiSkeleton = this.isMultiSkeleton(skeletonJSONObj);
        let dataJSON = isMultiSkeleton ? skeletonJSONObj[skeletonName] : skeletonJSONObj;

        if (!dataJSON) {
            console.warn(`Spine: No skeleton data for: ${skeletonName}, try load first valid one in JSON`);
            if (isMultiSkeleton) {
                for (const key in skeletonJSONObj) {
                    if (Object.hasOwnProperty.call(skeletonJSONObj, key)) {
                        dataJSON = skeletonJSONObj[key];
                        break;
                    }
                }
            }
        }

        const skeletonData = skeletonLoader.readSkeletonData(dataJSON);
        const skeleton = new Spine.Skeleton(skeletonData);

        return {
            skeletonData,
            skeleton,
            preMultipliedAlpha: skeleton.preMultipliedAlpha
        };
    }

    createAnimationState (skeleton: any): any {
        const stateData = new Spine.AnimationStateData(skeleton.data);
        const state = new Spine.AnimationState(stateData);
        return {stateData, state};
    }

    updateTime (): void {
        this.timeKeeper.update();
    }

    rendererSkeleton (skeleton: any): void {
        this.renderer.begin();
        this.renderer.drawSkeleton(skeleton, true);
        if (this.drawDebug) {
            this.renderer.drawSkeletonDebug(skeleton, true);
            const {x, y, width, height} = skeleton.getBoundsRect();
            this.renderer.rect(false, x, y, width, height, new Spine.Color(0, 0, 1, 1));
        }
        this.renderer.end();
    }

    removeRunningSkeleton (skin: any): void {
        this.runningSkeleton.delete(skin);
    }

    addRunningSkeleton (skin: any): void {
        if (!this.runningSkeleton.has(skin)) {
            this.runningSkeleton.add(skin);
        }
    }

    stopRenderSkeleton (): void {
        this.runningSkeleton.forEach(skin => {
            skin.clearTracks();
        });
        this.runningSkeleton.clear();
    }

    pauseRenderSkeleton (): void {}
    resumeRenderSkeleton (): void {}
}

export default SpineManager;
