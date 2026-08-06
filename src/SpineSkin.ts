import Skin from "./Skin";

/**
 * @author LK
 * Skin for rendering Spine skeletal animations.
 *
 * TypeScript counterpart of the original `SpineSkin.js`. Wraps a Spine skeleton
 * and its animation state, and drives the shared Spine renderer owned by the
 * `SpineManager`.
 */
const SpineEvents = {
  COMPLETE: "SpineEvents.complete",
  DISPOSE: "SpineEvents.dispose",
  END: "SpineEvents.end",
  EVENT: "SpineEvents.event",
  INTERRUPTED: "SpineEvents.interrupted",
  START: "SpineEvents.start",
};

class SpineSkin extends Skin {
  _costumeResolution: number;
  _textureSize: number[];
  lastFrameTime: number;
  spine: any;
  skeleton: any;
  animationState: any;
  preMultipliedAlpha: boolean;
  skeletonPosition: number[] | null;
  skeletonRotation: number;
  skeletonScale: number[];
  skeletonBaseSize: number[];
  scratchScale: number[];
  scratchPosition: number[];
  scratchRotation: number;
  eventListeners: Set<any>;
  EVENT: any;
  animationSpeed: number;
  root: any;
  _size: number[];

  /**
   * @param id - Unique identifier for this skin.
   * @param spineManager - The SpineManager instance.
   */
  constructor(id: number, spineManager: any) {
    super(id);

    this._costumeResolution = 1;
    this._textureSize = [0, 0];
    this.lastFrameTime = 0;

    this.spine = spineManager;
    this.skeleton = null;
    this.animationState = null;
    this.preMultipliedAlpha = false;

    // skeleton data in skeleton coordinate
    this.skeletonPosition = [0, 0];
    this.skeletonRotation = 0;
    this.skeletonScale = [1, 1];
    this.skeletonBaseSize = [200, 200];

    // scratch data in stage coordinate
    this.scratchScale = [100, 100];
    this.scratchPosition = [0, 0];
    this.scratchRotation = 0;

    this._size = this.skeletonBaseSize;
    this.eventListeners = new Set();
    this.EVENT = SpineEvents;
    this.animationSpeed = 1;
    this.root = null;
  }

  dispose(): void {
    this.clearTracks();
    super.dispose();
  }

  getAABB(): any {
    if (this.skeleton) {
      return this.skeleton.getBoundsRect();
    }
    return null;
  }

  get size(): number[] {
    return this._size;
  }

  set size(value: number[]) {
    this._size = value;
  }

  setSkin(skinName: string): void {
    this.skeleton.setSkinByName(skinName);
  }

  async setSkeleton(
    atlasDataKey: string,
    JSONFile: string,
    skeletonName?: string | boolean,
    animationName?: string | boolean,
    loop?: boolean,
  ): Promise<void> {
    const skData = await this.spine.createSkeleton(
      atlasDataKey,
      JSONFile,
      typeof skeletonName === "boolean" ? undefined : skeletonName,
    );
    if (!skData) {
      return;
    }

    this.preMultipliedAlpha = skData.preMultipliedAlpha;

    const skeleton = skData.skeleton;
    this.skeleton = skeleton;
    this.skeletonPosition = null; // reset originPosition

    // AnimationState
    const aniData = this.spine.createAnimationState(skeleton);

    if (this.animationState) {
      this.animationState.clearListeners();
      this.animationState.clearListenerNotifications();
    }

    this.animationState = aniData.state;

    this.animationState.addListener({
      event: this.onEvent.bind(this),
      complete: this.onComplete.bind(this),
      start: this.onStart.bind(this),
      end: this.onEnd.bind(this),
      dispose: this.onDispose.bind(this),
      interrupted: this.onInterrupted.bind(this),
    });

    if (typeof animationName === "string" && animationName) {
      this.setAnimation(0, animationName, loop);
    }

    this.root = this.getRootBone();
    if (this.root) {
      this.skeletonRotation = this.root.rotation;
    }

    this.animationState.apply(skeleton);
    skeleton.setSkin();
    skeleton.setToSetupPose();
    skeleton.updateCache();
    this.resetSize();
    this.emit(Skin.Events.WasAltered);
  }

  removeListener(event: any, callback: any): this {
    super.removeListener(event, callback);
    this.eventListeners.delete(event);
    return this;
  }

  addListener(event: any, callback: any): this {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.add(event);
      super.addListener(event, callback);
    }
    return this;
  }

  // sync scratch data to spine
  updateScaleAndSize(): void {
    const scaleX = this.scratchScale[0] / 100;
    const scaleY = this.scratchScale[1] / 100;
    this.skeleton.scaleX = this.skeletonScale[0] * scaleX;
    this.skeleton.scaleY = this.skeletonScale[1] * scaleY;

    const [w, h] = this.size;
    const sw = this.skeletonBaseSize[0] * Math.abs(scaleX);
    const sh = this.skeletonBaseSize[1] * Math.abs(scaleY);
    const dy = -(sh - h) / 2;
    this.skeletonPosition = this.skeletonPosition || [0, 0];
    this.skeletonPosition[1] += dy; // 更新中心点
    if (dy !== 0) {
      this.skeleton.y = this.skeletonPosition[1] + this.scratchPosition[1];
    }

    this.size = [sw, sh];
  }

  updatePosition(): void {
    this.skeleton.x =
      (this.skeletonPosition ? this.skeletonPosition[0] : 0) +
      this.scratchPosition[0];
    this.skeleton.y =
      (this.skeletonPosition ? this.skeletonPosition[1] : 0) +
      this.scratchPosition[1];
  }

  updateRotation(): void {
    if (this.root) {
      this.root.rotation = this.skeletonRotation + this.scratchRotation;
    }
  }

  setPosition([x, y]: number[]): void {
    if (
      this.skeleton &&
      (this.scratchPosition[0] !== x || this.scratchPosition[1] !== y)
    ) {
      this.scratchPosition = [x, y];
      this.updatePosition();
    }
  }

  setScale([scaleX, scaleY]: number[]): void {
    if (
      this.skeleton &&
      (this.scratchScale[0] !== scaleX || this.scratchScale[1] !== scaleY)
    ) {
      this.scratchScale = [scaleX, scaleY];
      this.updateScaleAndSize();
    }
  }

  setDirection(rotation: number): void {
    if (this.root && this.scratchRotation !== rotation) {
      this.scratchRotation = rotation;
      this.updateRotation();
    }
  }

  resetSize(): void {
    const skeleton = this.skeleton;
    this.skeletonScale = [1, 1];
    skeleton.scaleX = this.skeletonScale[0];
    skeleton.scaleY = this.skeletonScale[1];
    skeleton.updateWorldTransform();
    const skeletonBounds = skeleton.getBoundsRect();

    const [width, height] = this.skeletonBaseSize;

    let skScale = 1;
    const scaleX = width / (skeletonBounds.width || 1);
    const scaleY = height / (skeletonBounds.height || 1);
    skScale = Math.min(scaleX, scaleY);
    const [stageWidth, stageHeight] = this.spine.getNativeSize();
    // make center as origin point, and position to stage center
    const center = [stageWidth / 2, stageHeight / 2];
    this.skeletonPosition = [
      -((skeletonBounds.x + skeletonBounds.width / 2) * skScale) + center[0],
      -((skeletonBounds.y + skeletonBounds.height / 2) * skScale) + center[1],
    ];
    this.skeletonScale = [skScale, skScale];

    this._size = this.skeletonBaseSize;

    // Synchronize sprite and new skeleton stage data
    this.updateScaleAndSize();
    this.updateRotation();
    this.updatePosition();
  }

  getRootBone(): any {
    return this.skeleton && this.skeleton.getRootBone();
  }

  getBoneList(): string[] {
    const output: string[] = [];
    const skeletonData = this.skeleton && this.skeleton.data;
    if (skeletonData) {
      for (let i = 0; i < skeletonData.bones.length; i++) {
        output.push(skeletonData.bones[i].name);
      }
    }
    return output;
  }

  getSkinList(): string[] {
    const output: string[] = [];
    const skeletonData = this.skeleton && this.skeleton.data;
    if (skeletonData) {
      for (let i = 0; i < skeletonData.skins.length; i++) {
        output.push(skeletonData.skins[i].name);
      }
    }
    return output;
  }

  getSlotList(): string[] {
    const output: string[] = [];
    const skeleton = this.skeleton;
    if (skeleton) {
      for (let i = 0; i < skeleton.slots.length; i++) {
        output.push(skeleton.slots[i].data.name);
      }
    }
    return output;
  }

  getBoneAttribute(boneName: string, attrName: string): any {
    if (boneName) {
      const bone = this.findBone(boneName);
      if (bone) {
        switch (attrName) {
          case "worldY": {
            const rect = this.skeleton.getBoundsRect();
            return (
              bone[attrName] -
              (this.skeletonPosition ? this.skeletonPosition[1] : 0) -
              rect.height / 2
            );
          }
          case "worldX":
            return (
              bone[attrName] -
              (this.skeletonPosition ? this.skeletonPosition[0] : 0)
            );
          default:
            return bone[attrName];
        }
      }
    }
    return "";
  }

  findBone(boneName: string): any {
    return this.skeleton.findBone(boneName);
  }

  findBoneIndex(boneName: string): number {
    return this.skeleton.findBoneIndex(boneName);
  }

  findSlot(slotName: string): any {
    return this.skeleton.findSlot(slotName);
  }

  findSlotIndex(slotName: string): number {
    return this.skeleton.findSlotIndex(slotName);
  }

  findSkin(skinName: string): any {
    return this.skeleton.data.findSkin(skinName);
  }

  findEvent(eventDataName: string): any {
    return this.skeleton.data.findEvent(eventDataName);
  }

  setToSetupPose(): void {
    if (this.skeleton) {
      this.skeleton.setToSetupPose();
    }
  }

  getCurrentAnimation(trackIndex = 0): any {
    const current =
      this.animationState && this.animationState.getCurrent(trackIndex);
    if (current) {
      return current.animation;
    }
    return null;
  }

  getCurrentAnimationName(trackIndex = 0): string | null {
    const current = this.getCurrentAnimation(trackIndex);
    if (current) {
      return current.name;
    }
    return null;
  }

  play(animationName: string, loop?: boolean, ignoreIfPlaying?: boolean): this {
    this.setAnimation(0, animationName, loop, ignoreIfPlaying);
    return this;
  }

  findAnimation(animationName: string): any {
    return this.skeleton && this.skeleton.data.findAnimation(animationName);
  }

  setAnimation(
    trackIndex: number,
    animationName: string,
    loop: boolean = false,
    ignoreIfPlaying: boolean = false,
  ): any {
    if (ignoreIfPlaying && this.animationState) {
      const currentTrack = this.animationState.getCurrent(trackIndex);
      if (
        currentTrack &&
        currentTrack.animation.name === animationName &&
        !currentTrack.isComplete()
      ) {
        return;
      }
    }
    if (this.findAnimation(animationName)) {
      this.spine.addRunningSkeleton(this);
      return this.animationState.setAnimation(
        trackIndex,
        animationName,
        !!loop,
      );
    }
    return undefined;
  }

  addAnimation(
    trackIndex: number,
    animationName: string,
    loop = false,
    delay = 0,
  ): any {
    return this.animationState.addAnimation(
      trackIndex,
      animationName,
      loop,
      delay,
    );
  }

  setEmptyAnimation(trackIndex: number, mixDuration: number): any {
    return this.animationState.setEmptyAnimation(trackIndex, mixDuration);
  }

  getAnimationList(): string[] {
    const output: string[] = [];
    const skeletonData = this.skeleton && this.skeleton.data;
    if (skeletonData) {
      for (let i = 0; i < skeletonData.animations.length; i++) {
        output.push(skeletonData.animations[i].name);
      }
    }
    return output;
  }

  getAnimationAttribute(name: string, attrName: string): any {
    if (name) {
      const animation = this.findAnimation(name);
      if (animation) {
        if (attrName === "speed") return this.animationSpeed;
        return animation[attrName];
      }
    }
    return "";
  }

  clearTracks(): void {
    if (this.animationState) {
      this.animationState.clearTracks();
    }
    this.spine.removeRunningSkeleton(this);
  }

  clearTrack(trackIndex: number): boolean {
    this.animationState.clearTrack(trackIndex);
    const isMore = this.animationState.tracks.find((track: any) =>
      Boolean(track),
    );
    if (!isMore) {
      this.spine.removeRunningSkeleton(this);
    }
    return isMore;
  }

  onComplete(entry: any): void {
    this.emit(SpineEvents.COMPLETE, { entry, skin: this });
  }

  onDispose(entry: any): void {
    this.emit(SpineEvents.DISPOSE, { entry, skin: this });
  }

  onEnd(entry: any): void {
    this.emit(SpineEvents.END, { entry, skin: this });
  }

  onEvent(entry: any, event: any): void {
    this.emit(SpineEvents.EVENT, { entry, skin: this, event });
  }

  onInterrupted(entry: any): void {
    this.emit(SpineEvents.INTERRUPTED, { entry, skin: this });
  }

  onStart(entry: any): void {
    this.emit(SpineEvents.START, { entry, skin: this });
  }

  updateTransform(drawable: any): void {
    this.setScale(drawable._scale);
    this.setPosition(drawable._position);
    this.setDirection(90 - drawable._direction);
    // let drawable calculate the matrix if needed
    // make sure the matrix is updated when use normal scratch render
    drawable.getUniforms();
  }

  render(drawable: any, drawableScale: any, projection: any, opts: any): void {
    const { skeleton, animationState } = this;
    if (skeleton && animationState) {
      this.updateTransform(drawable);
      animationState.update(this.spine.timeKeeper.delta * this.animationSpeed);
      animationState.apply(skeleton);
      skeleton.updateWorldTransform();
      this.spine.rendererSkeleton(skeleton);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getTexture(scale?: number[]): any {
    return 1;
  }
}

export default SpineSkin;
