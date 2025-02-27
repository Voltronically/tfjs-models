/**
 * @license
 * Copyright 2021 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */
import * as hands from '@mediapipe/hands';

import {MEDIAPIPE_KEYPOINTS} from '../constants';
import {HandDetector} from '../hand_detector';
import {Keypoint} from '../shared/calculators/interfaces/common_interfaces';
import {Hand, HandDetectorInput} from '../types';

import {validateModelConfig} from './detector_utils';
import {MediaPipeHandsMediaPipeEstimationConfig, MediaPipeHandsMediaPipeModelConfig} from './types';

/**
 * MediaPipe detector class.
 */
class MediaPipeHandsMediaPipeDetector implements HandDetector {
  private readonly handsSolution: hands.Hands;

  // This will be filled out by asynchronous calls to onResults. They will be
  // stable after `await send` is called on the hands solution.
  private width = 0;
  private height = 0;
  private hands: Hand[];

  private selfieMode = false;

  // Should not be called outside.
  constructor(config: MediaPipeHandsMediaPipeModelConfig) {
    this.handsSolution = new hands.Hands({
      locateFile: (path, base) => {
        if (config.solutionPath) {
          const solutionPath = config.solutionPath.replace(/\/+$/, '');
          return `${solutionPath}/${path}`;
        }
        return `${base}/${path}`;
      }
    });
    this.handsSolution.setOptions({
      selfieMode: this.selfieMode,
      maxNumHands: config.maxHands,
    });
    this.handsSolution.onResults((results) => {
      this.height = results.image.height;
      this.width = results.image.width;
      this.hands = [];
      if (results.multiHandLandmarks !== null) {
        const handednessList = results.multiHandedness;
        const landmarksList = results.multiHandLandmarks;

        for (let i = 0; i < handednessList.length; i++) {
          this.hands.push({
            keypoints: this.translateOutput(landmarksList[i]),
            score: handednessList[i].score,
            handedness: handednessList[i].label
          });
        }
      }
    });
  }

  private translateOutput(landmarks: hands.NormalizedLandmarkList): Keypoint[] {
    return landmarks.map((landmark, i) => ({
                           x: landmark.x * this.width,
                           y: landmark.y * this.height,
                           z: landmark.z * this.width,
                           score: landmark.visibility,
                           name: MEDIAPIPE_KEYPOINTS[i],
                         }));
  }

  /**
   * Estimates hand poses for an image or video frame.
   *
   * It returns a single hand or multiple hands based on the maxHands
   * parameter passed to the constructor of the class.
   *
   * @param input
   * ImageData|HTMLImageElement|HTMLCanvasElement|HTMLVideoElement The input
   * image to feed through the network.
   *
   * @param config Optional.
   *       flipHorizontal: Optional. Default to false. When image data comes
   *       from camera, the result has to flip horizontally.
   *
   *       staticImageMode: Optional. Defaults to false. Currently unused in
   * this implementation. Image input types are assumed to be static images, and
   * video inputs are assumed to be non static images.
   *
   * @return An array of `Hand`s.
   */
  async estimateHands(
      input: HandDetectorInput,
      estimationConfig?: MediaPipeHandsMediaPipeEstimationConfig):
      Promise<Hand[]> {
    if (estimationConfig && estimationConfig.flipHorizontal &&
        (estimationConfig.flipHorizontal !== this.selfieMode)) {
      this.selfieMode = estimationConfig.flipHorizontal;
      this.handsSolution.setOptions({
        selfieMode: this.selfieMode,
      });
    }
    await this.handsSolution.send({image: input as hands.InputImage});
    return this.hands;
  }

  dispose() {
    this.handsSolution.close();
  }

  reset() {
    this.handsSolution.reset();
    this.width = 0;
    this.height = 0;
    this.hands = null;
    this.selfieMode = false;
  }

  initialize(): Promise<void> {
    return this.handsSolution.initialize();
  }
}

/**
 * Loads the MediaPipe solution.
 *
 * @param modelConfig An object that contains parameters for
 * the MediaPipeHands loading process. Please find more details of each
 * parameters in the documentation of the `MediaPipeHandsMediaPipeModelConfig`
 * interface.
 */
export async function load(modelConfig: MediaPipeHandsMediaPipeModelConfig):
    Promise<HandDetector> {
  const config = validateModelConfig(modelConfig);
  const detector = new MediaPipeHandsMediaPipeDetector(config);
  await detector.initialize();
  return detector;
}
