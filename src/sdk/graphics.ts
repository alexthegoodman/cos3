// ============================================================
// COS3 App SDK — Graphics Host Stub
// ============================================================
//
// This stub satisfies the HostGraphicsAPI interface so the SDK
// compiles and runs without a real WebGPU backend attached.
// Replace with your Konva / WebGPU implementation.
//
// Each method returns a stable UUID so guest scripts can hold
// references to resources across calls.
// ============================================================

import type { HostGraphicsAPI } from "./sandbox";
import type {
  BufferDescriptor,
  LightDescriptor,
  MeshDescriptor,
  PipelineConfig,
  TextureDescriptor,
} from "./types";
import { generateUUID } from "./index";

export class GraphicsStub implements HostGraphicsAPI {
  private _log(method: string, desc: unknown): string {
    const id = generateUUID();
    console.debug(`[COS3 Graphics Stub] ${method}`, desc, "→", id);
    return id;
  }

  createBuffer(desc: BufferDescriptor): string {
    return this._log("createBuffer", desc);
  }

  updateBuffer(id: string, data: ArrayBufferView): void {
    console.debug("[COS3 Graphics Stub] updateBuffer", id, data.byteLength, "bytes");
  }

  createTexture(desc: TextureDescriptor): string {
    return this._log("createTexture", desc);
  }

  updateTexture(id: string, data: ArrayBufferView): void {
    console.debug("[COS3 Graphics Stub] updateTexture", id, data.byteLength, "bytes");
  }

  createPipeline(cfg: PipelineConfig): string {
    return this._log("createPipeline", cfg);
  }

  dispatchCompute(pipelineId: string, x: number, y: number, z: number): void {
    console.debug("[COS3 Graphics Stub] dispatchCompute", pipelineId, { x, y, z });
  }

  createMesh(desc: MeshDescriptor): string {
    return this._log("createMesh", desc);
  }

  createLight(desc: LightDescriptor): string {
    return this._log("createLight", desc);
  }
}