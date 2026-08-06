import LayerFolder from './LayerFolder';
import log from './util/log';

/**
 * @author LK
 *
 * Manages layers for a renderer. TypeScript counterpart of the original
 * `LayerManager.js`. Owns a root folder, supports automatic layer sorting and
 * computes shader separators that mark which drawables are unshaded.
 */
type Separator = [0 | 1 | 2, any, number, boolean];

class LayerManager {
    _renderer: any;
    _layerSortingEnabled: boolean;
    _order: 1 | -1;
    rootFolder: LayerFolder;
    defaultFolderDrawableAddTo: LayerFolder;
    _sortedDrawList: number[];
    shaderSeparators: (Separator[] & {restSeps: number});
    separatorChanged: boolean;

    constructor (renderer: any) {
        this._renderer = renderer;
        /** Whether automatic layer sorting is enabled. */
        this._layerSortingEnabled = false;
        /** Sort order: 1 ascending / -1 descending. */
        this._order = 1;
        /** Root folder holding all content. */
        this.rootFolder = new LayerFolder('__ROOT_FOLDER__', renderer, true);
        /** Folder that new drawables are added to by default. */
        this.defaultFolderDrawableAddTo = this.rootFolder;
        /** Cached, previously sorted draw list. */
        this._sortedDrawList = [];
        /**
         * Shader separator info. Each entry `[type, value, listIdx]`:
         *   - type: 0 (value split) | 1 (drawable split) | 2 (folder split)
         *   - value: layerIdx | drawableID | [layerIdx, folder]
         *   - listIdx: position in the list
         */
        this.shaderSeparators = [
            [0, Infinity, Infinity, true]
        ] as Separator[] & {restSeps: number};
        this.shaderSeparators.restSeps = 1;
        this.separatorChanged = false;
    }

    get layerSortingEnabled (): boolean {
        return this._layerSortingEnabled;
    }

    /**
     * Set the minimum unshaded separator info.
     * @param type 0 (value split) | 1 (drawable split) | 2 (folder split).
     * @param sepValue The split value.
     */
    setMinUnshadedInfo (type: 0 | 1 | 2, sepValue: number | string): void {
        const sep = this.shaderSeparators[0];
        if (sep[0] !== type || sep[1] !== sepValue) {
            sep[0] = type;
            sep[1] = sepValue;
            LayerFolder.visualDirty = true;
            this.separatorChanged = true;
        }
    }

    get needResort (): boolean {
        return this.layerSortingEnabled && LayerFolder.visualDirty;
    }

    /**
     * Sort the sprite layer of the draw list (when enabled) and return it.
     */
    getSortedDrawListAndUpdateSeparators (
        drawList: number[],
        startIdx: number,
        endIdx: number
    ): number[] {
        // Sort all dirty folders.
        if (this._layerSortingEnabled) LayerFolder.sortAllDirtyFolders(this._order);
        // Sorting / drawable add-remove happened.
        if (LayerFolder.visualDirty) {
            const newList: number[] = [];
            for (let i = 0; i < startIdx; i++) newList.push(drawList[i]);
            this.rootFolder.getItemsAndSeparators(newList, this.shaderSeparators, this._order);
            for (let i = endIdx; i < drawList.length; i++) newList.push(drawList[i]);
            this._sortedDrawList = newList;
            this._renderer.dirty = true;
            LayerFolder.visualDirty = false;
        }
        return this._sortedDrawList;
    }

    enableLayerSorting (on: boolean): void {
        this._layerSortingEnabled = !!on;
    }

    setSortInAscendingOrder (ascending: boolean): void {
        const oldOrder = this._order;
        this._order = ascending ? 1 : -1;
        if (oldOrder * this._order < 0) {
            LayerFolder.sortAllDirtyFolders(this._order, true);
            this.shaderSeparators.forEach(sep => {
                if (sep[0] === 0) sep[1] *= -1;
                else if (sep[0] === 2) sep[1][0] *= -1;
            });
        }
    }

    get order (): 1 | -1 {
        return this._order;
    }

    /**
     * Create a folder and attach it to a parent folder.
     */
    createLayerFolder (name: string, parentFolder: LayerFolder = this.rootFolder): LayerFolder | null {
        if (!parentFolder) return null;
        if (parentFolder._subFoldersHaveUniqueName) {
            const existingFolder = parentFolder.nameToSubFolder[name];
            if (existingFolder) {
                log.warn(`Subfolder with name ${name} already exists in the parent folder.`);
                return existingFolder;
            }
        }
        const newFolder = new LayerFolder(name, this._renderer);
        parentFolder.add(newFolder);
        return newFolder;
    }

    /**
     * Refresh separator info (used when layer sorting is disabled).
     */
    refreshShaderSeparators (drawList: number[]): void {
        if (this._renderer.dirty || this.separatorChanged) {
            LayerFolder.initSeparator(this.shaderSeparators, this._order);
            for (let i = 0; i < drawList.length && this.shaderSeparators.restSeps > 0; i++) {
                LayerFolder.checkAndSetSeparator(
                    this.shaderSeparators,
                    i,
                    drawList[i],
                    true,
                    this._order,
                    this._renderer,
                    this.rootFolder
                );
            }
            this.separatorChanged = false;
        }
    }
}

export default LayerManager;
