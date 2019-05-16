import WBSession from "./WBSession"
import Ruler from "./Ruler"
import Thanos from "./lib/Thanos"
import EventCollector from "./EventCollector"

// Todo
// Preserve delete, resize, more buttons rotation

export default class WBApexTool {
  private apexToolElm: HTMLElement
  private removeBtn: HTMLElement
  private rotateBtn: HTMLElement
  private scaleBtn: HTMLElement
  private moreBtn: HTMLElement
  private readonly wbSession: WBSession

  private mode: undefined|'move'|'rotate'|'scale' = undefined
  private mouseOrigin: {
    x: number,
    y: number
  }

  private initialDistance: number
  private initialAngle: number
  private lastFinalScale: number
  private lastFinalRotate: number
  private lastFinalTranslate: {
    x: number,
    y: number
  }

  private eventCollector: EventCollector

  constructor(apexToolElm: HTMLElement, wbSession: WBSession) {
    this.apexToolElm = apexToolElm
    this.wbSession = wbSession

    // Create event collector instance
    this.eventCollector = new EventCollector()

    // Store each button of apex tool
    this.removeBtn = this.apexToolElm.querySelector('.remove')
    this.rotateBtn = this.apexToolElm.querySelector('.rotate')
    this.scaleBtn = this.apexToolElm.querySelector('.scale')
    this.moreBtn = this.apexToolElm.querySelector('.more')

    // Add apex tool triggering event listener
    document.addEventListener('webuffetscan', this.start.bind(this))
  }

  // fires when mouse down
  private onMouseDown(e: MouseEvent) {
    if (this.wbSession.wbState !== 'apex') return
    
    this.mouseOrigin = {
      x: e.pageX,
      y: e.pageY
    }
    
    this.wbSession.clearRedo()
    this.lastFinalRotate = this.wbSession.getFinalState().rotate
    this.lastFinalScale = this.wbSession.getFinalState().scale
    this.lastFinalTranslate = this.wbSession.getFinalState().translate

    if (e.target instanceof HTMLElement) {
      if (e.target.closest('#wbc-editing-boundary .rotate')) {
        // rotation
        this.mode = 'rotate'
    
        const rect = this.wbSession.getSelectedElement().getBoundingClientRect()
        let R2D = 180 / Math.PI, center, x, y
        center = {
          x: rect.left + (rect.width / 2),
          y: rect.top + (rect.height / 2)
        }
        x = e.pageX - center.x
        y = e.pageY - center.y
        this.initialAngle = R2D * Math.atan2(y, x)
      } else if (e.target.closest('#wbc-editing-boundary .scale')) {
        // scaling
        this.mode = 'scale'
        let rect = this.wbSession.getSelectedElement().getBoundingClientRect()
        this.initialDistance = Ruler.getDistance(e.pageX, e.pageY, rect.left + rect.width/2, rect.top + rect.height/2)
      } else if (e.target.closest('#wbc-editing-boundary')) {
        this.mode = 'move'
      }
    }
  }

  // fires when mouse move
  private onMouseMove(e: MouseEvent) {
    if (!this.mode) return
    
    if (this.mode === 'scale') {
      let rect = this.wbSession.getSelectedElement().getBoundingClientRect()
      let distance = Ruler.getDistance(e.pageX, e.pageY, rect.left + rect.width/2, rect.top + rect.height/2)
      let newScale = distance / this.initialDistance * this.lastFinalScale
    
      let finalState = this.wbSession.getFinalState()
      this.wbSession.getSelectedElement().style.transform = Ruler.generateCSS(finalState.translate.x, finalState.translate.y, newScale, finalState.rotate)
    
      // stores final scale amount to the session
      this.wbSession.setFinal({
        scale: newScale
      })
    } else if (this.mode === 'rotate') {
      const rect = this.wbSession.getSelectedElement().getBoundingClientRect()
      let R2D = 180 / Math.PI, center, x, y, d
      center = {
        x: rect.left + (rect.width / 2),
        y: rect.top + (rect.height / 2)
      }
      x = e.pageX - center.x
      y = e.pageY - center.y
      d = R2D * Math.atan2(y, x)
      let newAngle = d - this.initialAngle + this.lastFinalRotate
      let finalState = this.wbSession.getFinalState()
      this.wbSession.getSelectedElement().style.transform = Ruler.generateCSS(finalState.translate.x, finalState.translate.y, finalState.scale, newAngle)
    
      // stores final roate angle to the session
      this.wbSession.setFinal({
        rotate: newAngle
      })
    } else if (this.mode === 'move') {
      let dx = e.pageX - this.mouseOrigin.x, dy = e.pageY - this.mouseOrigin.y
      let finalState = this.wbSession.getFinalState()
      this.wbSession.getSelectedElement().style.transform = Ruler.generateCSS(this.lastFinalTranslate.x + dx, this.lastFinalTranslate.y + dy, finalState.scale, finalState.rotate)

      // stores final translation state to the session
      this.wbSession.setFinal({
        translate: {
          x: this.lastFinalTranslate.x + dx,
          y: this.lastFinalTranslate.y + dy
        }
      })
    }
    
    this.setBoundingRectPos()
  }

  private onMouseUp(e: MouseEvent) {
    if (this.mode) this.mode = undefined
    this.wbSession.push()
    chrome.storage.local.set( 
      { foo : [
          {
            id : this.wbSession.getSelectedElement().tagName,
            style :
              {
                isDeleted : false,
                transform : JSON.stringify(this.wbSession.getSelectedElement().style.transform),
                rotate : JSON.stringify(this.wbSession.getSelectedElement().style.rotate),
                scale : JSON.stringify(this.wbSession.getSelectedElement().style.scale)
              }
          }
        ] 
      } )
    chrome.storage.local.get( ['foo'], function(items) {
      console.log(JSON.stringify(items))
    } )
  }

  private onKeyDown(e: KeyboardEvent) {
    // Escape ApexTool with no operations
    if(e.key == 'Escape') {
      this.stop()
      chrome.storage.sync.set({ "id" : this.wbSession.getSelectedElement().id , "style" : this.wbSession.getFinalState() }  , function() {})
      document.dispatchEvent(new CustomEvent('startselector'))
    }
    if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
      if (e.shiftKey) { // redo
        e.preventDefault()
        if( this.wbSession.redoLength() <= 0 ) return;
        this.wbSession.redo()
        this.wbSession.getSelectedElement().style.transform = Ruler.generateCSS(this.wbSession.getFinalState().translate.x, this.wbSession.getFinalState().translate.y, this.wbSession.getFinalState().scale, this.wbSession.getFinalState().rotate)
        this.setBoundingRectPos()
      } else { // undo
        e.preventDefault()
        if( this.wbSession.length() <= 1 ) return;
        this.wbSession.pop()
        this.wbSession.getSelectedElement().style.transform = Ruler.generateCSS(this.wbSession.getFinalState().translate.x, this.wbSession.getFinalState().translate.y, this.wbSession.getFinalState().scale, this.wbSession.getFinalState().rotate)
        this.setBoundingRectPos()
      }
    }
  }

  // Start the ApexTool functioning
  public start() {
    // Show UI
    this.apexToolElm.classList.remove('wb-hidden')
    // Set UI's position
    this.setBoundingRectPos()
    // Set WEBuffet session's state to 'apex'
    this.wbSession.wbState = 'apex'
    
    // Add event listeners using EventCollector
    this.eventCollector.attachEvent(window, 'mousedown', this.onMouseDown.bind(this))
    this.eventCollector.attachEvent(window, 'mousemove', this.onMouseMove.bind(this))
    this.eventCollector.attachEvent(window, 'mouseup', this.onMouseUp.bind(this))
    ;['scroll', 'resize'].forEach(eventName => {
      this.eventCollector.attachEvent(window, eventName, this.setBoundingRectPos.bind(this))
    })
    this.eventCollector.attachEvent(window, 'keydown', this.onKeyDown.bind(this))
    this.eventCollector.attachEvent(this.removeBtn, 'click', this.remove.bind(this))
    this.wbSession.push()
  }

  public stop() {
    // Hide UI
    this.apexToolElm.classList.add('wb-hidden')
    // Set WEBuffet session's state to 'pending'
    this.wbSession.wbState = 'pending'
    // Remove all event listeners
    this.eventCollector.clearEvent()
  }

  // sets the position and the shape of ApexTool
  // based on the selected element
  private setBoundingRectPos() {
    const selectedElm = this.wbSession.getSelectedElement()
    const rect = selectedElm.getBoundingClientRect()
    const finalState = this.wbSession.getFinalState()

    // Set ApexTool's boundary position
    this.apexToolElm.style.left = rect.left + (rect.width - selectedElm.clientWidth) / 2 - (selectedElm.clientWidth * finalState.scale - selectedElm.clientWidth) / 2 + 'px'
    this.apexToolElm.style.top = rect.top + (rect.height - selectedElm.clientHeight) / 2 - (selectedElm.clientHeight * finalState.scale - selectedElm.clientHeight) / 2 + 'px'
    this.apexToolElm.style.width = selectedElm.clientWidth * finalState.scale  + 'px'
    this.apexToolElm.style.height = selectedElm.clientHeight * finalState.scale + 'px'
    this.apexToolElm.style.transform = 'rotate(' + Ruler.getRotationValue(selectedElm) + 'deg)'

    // Preserve buttons' horizontality
    // by rotating to oposite degrees
    this.removeBtn.style.transform = 'rotate(' + -(finalState.rotate) + 'deg)'
    this.removeBtn.style.webkitTransform = 'rotate(' + -(finalState.rotate) + 'deg)'
    this.rotateBtn.style.transform = 'rotate(' + -(finalState.rotate) + 'deg)'
    this.rotateBtn.style.webkitTransform = 'rotate(' + -(finalState.rotate) + 'deg)'
    this.removeBtn.style.transform = 'rotate(' + -(finalState.rotate) + 'deg)'
    this.removeBtn.style.webkitTransform = 'rotate(' + -(finalState.rotate) + 'deg)'
    // this.moreBtn.style.transform = 'rotate(' + -(finalState.rotate) + 'deg)'
    // this.moreBtn.style.webkitTransform = 'rotate(' + -(finalState.rotate) + 'deg)'
  }

  // removes the selected element
  private remove() {
    // Stop ApexTool and go back to Selector after remove element
    this.wbSession.getSelectedElement().style.display = 'none'
    this.stop()
    chrome.storage.local.set( 
      { foo : [
          {
            id : this.wbSession.getSelectedElement().tagName,
            style :
              {
                isDeleted : true,
                transform : JSON.stringify(this.wbSession.getSelectedElement().style.transform),
                rotate : JSON.stringify(this.wbSession.getSelectedElement().style.rotate),
                scale : JSON.stringify(this.wbSession.getSelectedElement().style.scale)
              }
          }
        ] 
      } )
    chrome.storage.local.get( ['foo'], function(items) {
      console.log(JSON.stringify(items))
    } )

    document.dispatchEvent(new CustomEvent('startselector'))
  }
}