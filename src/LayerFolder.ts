/**
 * @author LK
 *
 * A layer folder groups drawables (by ID) and/or sub folders, and acts as a
 * render-sorting unit. TypeScript counterpart of the original `LayerFolder.js`.
 *
 * Folder items are either drawable IDs (`number`) or nested `LayerFolder`
 * instances.
 */
type FolderItem = number | LayerFolder;

/**
 * Separator descriptor used to mark shader layer boundaries.
 * Each entry is `[type, value, listIdx, readMe]`:
 *   - type: 0 (value split) | 1 (drawable split) | 2 (folder split)
 *   - value: layerIdx | drawableID | [layerIdx, folder]
 *   - listIdx: position in the flattened draw list
 */
type Separator = [0 | 1 | 2, any, number, boolean];

class LayerFolder {
    _renderer: any;
    name: string;
    _items: FolderItem[];
    _subFoldersHaveUniqueName: boolean;
    nameToSubFolder: {[folderName: string]: LayerFolder};
    _layerIndex: number;
    _orderDirty: boolean;
    parent: LayerFolder | null;

    /** All folders currently existing. */
    static allFolders: Set<LayerFolder> = new Set();
    /** Folders whose content needs re-sorting. */
    static orderDirtyFolders: Set<LayerFolder> = new Set();
    /** Whether some folder changed in a way that affects rendering (sort/add/remove). */
    static visualDirty = false;

    /**
     * @param name Folder name.
     * @param renderer The renderer instance.
     * @param subFoldersHaveUniqueName Whether this folder's sub folders must have unique names.
     */
    constructor (name: string, renderer: any, subFoldersHaveUniqueName = false) {
        this._renderer = renderer;
        this.name = name;
        /** @type {FolderItem[]} */
        this._items = [];
        // If sub folder names must be unique, index sub folders by name.
        if (subFoldersHaveUniqueName) {
            this._subFoldersHaveUniqueName = true;
            this.nameToSubFolder = Object.create(null);
        }
        /** @type {number} */
        this._layerIndex = 0;
        /** @type {boolean} */
        this._orderDirty = false;
        /** @type {LayerFolder|null} */
        this.parent = null;

        LayerFolder.allFolders.add(this);
    }

    /**
     * Sort every dirty folder (optionally force-sort all).
     * @param sortOrder 1 (ascending) | -1 (descending).
     * @param forceSortAll Whether to force re-sorting all folders.
     */
    static sortAllDirtyFolders (sortOrder: 1 | -1 = 1, forceSortAll = false): void {
        if (forceSortAll) {
            LayerFolder.allFolders.forEach(folder => {
                folder.sortIfOrderDirty(sortOrder, false, true);
            });
        } else {
            LayerFolder.orderDirtyFolders.forEach(folder => {
                folder.sortIfOrderDirty(sortOrder, false);
            });
        }
        LayerFolder.orderDirtyFolders = new Set();
    }

    get items (): FolderItem[] {
        return this._items;
    }

    get orderDirty (): boolean {
        return this._orderDirty;
    }

    /**
     * Mark whether this folder's order is dirty.
     * @param dirty Whether dirty.
     * @param removeFromDirtyList When clearing, also remove from the dirty list.
     */
    setOrderDirty (dirty: boolean, removeFromDirtyList = false): void {
        if (dirty) {
            if (!this._orderDirty) {
                LayerFolder.orderDirtyFolders.add(this);
            }
            this._orderDirty = true;
            LayerFolder.visualDirty = true;
        } else {
            this._orderDirty = false;
            if (removeFromDirtyList) {
                LayerFolder.orderDirtyFolders.delete(this);
            }
        }
    }

    get layerIndex (): number {
        return this._layerIndex;
    }

    set layerIndex (idx: number) {
        if (this._layerIndex !== idx) {
            this._layerIndex = idx;
            // Mark the parent folder as order-dirty.
            if (this.parent) this.parent.setOrderDirty(true);
        }
    }

    /**
     * Add an item to this folder (moving it out of its old folder if any).
     * @param item Drawable ID or sub folder.
     * @param deleteEmptyFolder Whether to delete the old folder if it becomes empty.
     * @param sortImmediately Unused placeholder for immediate sorting.
     */
    add (item: FolderItem, deleteEmptyFolder = false, sortImmediately = false): void {
        // Cannot add self.
        if (item === this) return;
        const parent = item instanceof LayerFolder
            ? item.parent
            : this._renderer.getDrawableLayerFolder(item);
        // Already in this folder.
        if (parent === this) return;
        if (item instanceof LayerFolder && this._subFoldersHaveUniqueName) {
            // Duplicate sub folder name -> ignore.
            if (this.nameToSubFolder[item.name]) return;
        }
        // Remove from old folder.
        if (parent) parent.remove(item, deleteEmptyFolder);

        if (item instanceof LayerFolder) {
            item.parent = this;
            LayerFolder.allFolders.add(item);
            if (this._subFoldersHaveUniqueName) this.nameToSubFolder[item.name] = item;
        } else {
            this._renderer.setDrawableLayerFolder(item, this);
        }
        this._items.push(item);
        LayerFolder.visualDirty = true;
        this.setOrderDirty(true);
    }

    /**
     * Remove an item from this folder.
     * @param item Drawable ID or sub folder.
     * @param deleteEmptyFolder Whether to delete this folder if it becomes empty.
     */
    remove (item: FolderItem, deleteEmptyFolder = false): void {
        const index = this._items.indexOf(item);
        if (index !== -1) {
            if (item instanceof LayerFolder) {
                item.parent = null;
                LayerFolder.allFolders.delete(item);
                if (this._subFoldersHaveUniqueName) delete this.nameToSubFolder[item.name];
            } else {
                this._renderer.setDrawableLayerFolder(item, null);
            }
            this._items.splice(index, 1);
            LayerFolder.visualDirty = true;
            if (deleteEmptyFolder && this._items.length === 0) {
                // Recursively delete empty folders.
                if (this.parent) this.parent.remove(this, true);
            }
        }
    }

    /**
     * Change the position of a drawable within this folder (legacy layer ops).
     * @param item Item to move.
     * @param sortOrder 1 (ascending) | -1 (descending).
     * @param order Target position (or relative delta when isRelative).
     * @param isRelative Whether `order` is a relative delta.
     */
    changeDrawableOrder (
        item: FolderItem,
        sortOrder: 1 | -1,
        order: number,
        isRelative = false
    ): void {
        if (!order && order !== 0) return;
        if (this._items.length < 2) return;
        this.sortIfOrderDirty(sortOrder, true);
        const myIdx = this._items.indexOf(item);
        if (myIdx !== -1) {
            this._items.splice(myIdx, 1);
            LayerFolder.visualDirty = true;
            let idxToInsert = order;
            if (isRelative) idxToInsert += myIdx;

            if (idxToInsert <= 0) {
                // Move to the front.
                const newLayerIdx = this.getLayerIndexForItem(this._items[0]);
                this.setLayerIndexForItem(item, newLayerIdx);
                this._items.unshift(item);
            } else if (idxToInsert > this._items.length - 1) {
                // Move to the end.
                const newLayerIdx = this.getLayerIndexForItem(this._items[this._items.length - 1]);
                this.setLayerIndexForItem(item, newLayerIdx);
                this._items.push(item);
            } else {
                // Insert in the middle using the average layer index.
                const v1 = this.getLayerIndexForItem(this._items[idxToInsert]);
                const v2 = this.getLayerIndexForItem(this._items[idxToInsert - 1]);
                const newLayerIdx = (v1 + v2) / 2;
                this.setLayerIndexForItem(item, newLayerIdx);
                this._items.splice(idxToInsert, 0, item);
            }
        }
    }

    getLayerIndexForItem (item: FolderItem): number {
        if (item instanceof LayerFolder) {
            return item.layerIndex;
        }
        return this._renderer.getDrawableLayerIndex(item);
    }

    setLayerIndexForItem (item: FolderItem, value: number, changing = false): void {
        const newValue = (changing ? this.getLayerIndexForItem(item) : 0) + value;
        if (item instanceof LayerFolder) {
            item.layerIndex = newValue;
        } else {
            this._renderer.setDrawableLayerIndex(item, newValue);
        }
    }

    /**
     * Sort this folder if its order is dirty (or forced).
     * @param sortOrder 1 (ascending) | -1 (descending).
     * @param removeFromDirtyList Whether to remove from the dirty list after sorting.
     * @param needSorting Whether sorting is required.
     */
    sortIfOrderDirty (sortOrder: 1 | -1 = 1, removeFromDirtyList = false, needSorting = this.orderDirty): void {
        if (needSorting) {
            this._items.sort((a, b) => {
                const idx1 = this.getLayerIndexForItem(a);
                const idx2 = this.getLayerIndexForItem(b);
                return sortOrder * (idx1 - idx2);
            });
            LayerFolder.visualDirty = true;
            this.setOrderDirty(false, removeFromDirtyList);
        }
    }

    /**
     * Initialize separator info.
     * @param separators Separator array (also carries `restSeps`).
     * @param sortOrder 1 (ascending) | -1 (descending).
     */
    static initSeparator (separators: (Separator[] & {restSeps: number}), sortOrder: 1 | -1): void {
        separators.restSeps = separators.length;
        for (let i = 0; i < separators.length; i++) {
            const sep = separators[i];
            sep[2] = Infinity;
            sep[3] = true; // whether this separator still needs reading
            if (sep[0] === 0 && sep[1] === Infinity * sortOrder) {
                sep[3] = false;
                separators.restSeps--;
            }
        }
    }

    /**
     * Update separator info based on the current item.
     */
    static checkAndSetSeparator (
        separators: Separator[] & {restSeps: number},
        i: number,
        item: FolderItem,
        root: boolean,
        sortOrder: 1 | -1,
        renderer: any,
        folder: LayerFolder
    ): void {
        if (separators.restSeps === 0) return;
        for (let j = 0; j < separators.length; j++) {
            const sep = separators[j];
            if (sep[3]) {
                switch (sep[0]) {
                case 0: {
                    const layerIdx = item instanceof LayerFolder
                        ? item.layerIndex
                        : renderer.getDrawableLayerIndex(item);
                    if (root && sortOrder * (layerIdx - sep[1]) >= 0) {
                        sep[2] = i;
                        sep[3] = false;
                        separators.restSeps--;
                    }
                    break;
                }
                case 1:
                    if (item === sep[1]) {
                        sep[2] = i;
                        sep[3] = false;
                        separators.restSeps--;
                    }
                    break;
                case 2:
                    if (folder === sep[1][1]) {
                        const layerIdx = item instanceof LayerFolder
                            ? item.layerIndex
                            : renderer.getDrawableLayerIndex(item);
                        const lastItem = folder.items[folder.items.length - 1];
                        if (sortOrder * (layerIdx - sep[1][0]) >= 0) {
                            sep[2] = i;
                            sep[3] = false;
                            separators.restSeps--;
                        } else if (item === lastItem) {
                            sep[2] = i + 1;
                            sep[3] = false;
                            separators.restSeps--;
                        }
                    }
                    break;
                default:
                }
            }
        }
    }

    /**
     * Recursively flatten this folder (and sub folders) into a single list,
     * updating separator info along the way.
     * @returns `[list, separators]`
     */
    getItemsAndSeparators (
        list: number[] = [],
        separators: Separator[] | null = null,
        sortOrder: 1 | -1 = 1,
        root = true
    ): [number[], Separator[] | null] {
        if (root && separators) {
            LayerFolder.initSeparator(separators as Separator[] & {restSeps: number}, sortOrder);
        }
        for (let i = 0; i < this._items.length; i++) {
            const item = this._items[i];
            if (separators) {
                LayerFolder.checkAndSetSeparator(
                    separators as Separator[] & {restSeps: number},
                    list.length,
                    item,
                    root,
                    sortOrder,
                    this._renderer,
                    this
                );
            }
            if (item instanceof LayerFolder) {
                item.getItemsAndSeparators(list, separators, sortOrder, false);
            } else {
                list.push(item);
            }
        }
        return [list, separators];
    }
}

export default LayerFolder;
