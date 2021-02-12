/**
 * Internal dependencies
 */
import useDeviceEditorClasses from './use-device-editor-classes'
import getSnapWidths from './get-snap-widths'

/**
 * External dependencies
 */
import {
	useBlockContext,
} from '~stackable/hooks'
import { clamp, isEqual } from 'lodash'
import classnames from 'classnames'

/**
 * WordPress dependencies
 */
import { compose } from '@wordpress/compose'
import { ResizableBox, TextControl } from '@wordpress/components'
import {
	useState, useEffect, useRef, useCallback,
} from '@wordpress/element'
import { withSelect } from '@wordpress/data'
import useWithShift from './use-with-shift'
import { AdvancedRangeControl, AdvancedTextControl } from '..'

const MIN_COLUMN_WIDTHS = {
	Desktop: 100,
	Tablet: 50,
	Mobile: 50,
}

const ResizableColumn = props => {
	const {
		isFirstBlock, isLastBlock, isOnlyBlock, adjacentBlocks, blockIndex, parentBlock,
	} = useBlockContext( props.blockProps )

	// This is used to add editor classes based on the preview device type.
	// Mainly for generating editor styles.
	useDeviceEditorClasses( props.previewDeviceType )

	const {
		toggleSelection,
	} = props.blockProps

	const [ currentWidths, setCurrentWidths ] = useState( [] )
	const [ newWidthsPercent, setNewWidthsPercent ] = useState( [] )
	const [ maxWidth, setMaxWidth ] = useState( 2000 )
	const [ tempStyles, setTempStyles ] = useState( '' )
	const [ snapWidths, setSnapWidths ] = useState( null )

	const isDesktop = props.previewDeviceType === 'Desktop'
	const isTablet = props.previewDeviceType === 'Tablet'

	// Reset the column widths in desktop if a column was added / removed.
	const [ prevAdjacentBlocks, setPrevAdjacentBlocks ] = useState( adjacentBlocks.length )
	useEffect( () => {
		if ( prevAdjacentBlocks !== adjacentBlocks.length ) {
			// Reset the desktop sizes, no need to resize tablet and mobile.
			props.onResetDesktop()

			// Remember the previous block length.
			setPrevAdjacentBlocks( adjacentBlocks.length )
		}
	}, [ adjacentBlocks ] )

	// We have a timeout below, this ensures that our timeout only runs while
	// this Component is mounted.
	const [ isMounted, setIsMounted ] = useState( false )
	useEffect( () => {
		setIsMounted( true )
		return () => {
			setIsMounted( false )
		}
	}, [] )

	const isShiftKey = useWithShift()
	useEffect( () => {
		setSnapWidths( null )
	}, [ isShiftKey ] )

	const [ isEditWidth, setIsEditWidth ] = useState( false )
	const [ defaultInputValue, setDefaultInputValue ] = useState( '' )
	const popupRef = useRef()
	const outsideClickListener = useCallback( event => {
		console.log( event.target )
		if ( ! event.target.closest( '.stk-resizable-column__popup' ) ) {
			setIsEditWidth( false )
		}
	}, [] )
	useEffect( () => {
		if ( isEditWidth ) {
			setDefaultInputValue( props.blockProps.attributes.columnWidth )
			document.addEventListener( 'click', outsideClickListener )
			// setTimeout( () => {
			// console.log( 'popupRef', popupRef )
			popupRef.current.querySelector( 'input' ).select()
			// }, 1 )
			return () => {
				document.removeEventListener( 'click', outsideClickListener )
			}
		}
	}, [ isEditWidth ] )

	const className = classnames( [
		'stk-column-resizeable',
		className,
	] )

	return (
		<ResizableBox
			enable={ {
				top: false,
				right: props.previewDeviceType === 'Desktop' ? ! isOnlyBlock && ! isLastBlock : ! isOnlyBlock,
				bottom: false,
				left: props.previewDeviceType === 'Desktop' ? ! isOnlyBlock && ! isFirstBlock : false,
				topRight: false,
				bottomRight: false,
				bottomLeft: false,
				topLeft: false,
			} }
			minWidth={ MIN_COLUMN_WIDTHS[ props.previewDeviceType ] }
			minHeight="100"
			maxWidth={ maxWidth }
			className={ className }
			showHandle={ props.showHandle }
			snap={ snapWidths }
			snapGap={ 15 }
			onResizeStart={ ( _event, _direction ) => {
				toggleSelection( false )

				// In desktop, get all the column widths.
				if ( isDesktop ) {
					// Get the current pixel width of the columns.
					const parentEl = document.querySelector( `[data-block="${ parentBlock.clientId }"]` )
					const parentWidth = parentEl.clientWidth
					const columnWidths = adjacentBlocks.map( ( { clientId, attributes } ) => {
						// If there's already a column width set, use that value.
						if ( attributes.columnWidth ) {
							return parentWidth * attributes.columnWidth / 100
						}
						const blockEl = document.querySelector( `[data-block="${ clientId }"]` )
						return blockEl?.clientWidth || 0
					} )
					setCurrentWidths( columnWidths )

					// Set the maximum width for the current column. The max
					// width depends on the adjacent block, the adjacent should
					// go past the minimum.
					const adjacentBlockIndex = _direction === 'right' ? blockIndex + 1 : blockIndex - 1
					const maxWidth = columnWidths[ blockIndex ] + ( columnWidths[ adjacentBlockIndex ] - MIN_COLUMN_WIDTHS.Desktop )
					setMaxWidth( maxWidth )

				// Tablet and mobile.
				} else {
					// Get the current pixel width of the columns.
					const blockEl = document.querySelector( `[data-block="${ props.blockProps.clientId }"]` )
					const columnWidth = blockEl?.clientWidth || 0
					setCurrentWidths( columnWidth )

					// The maximum width is the total width of the row.
					const parentEl = document.querySelector( `[data-block="${ parentBlock.clientId }"]` )
					const maxWidth = parentEl?.clientWidth || 0
					setMaxWidth( maxWidth )
				}
			} }
			onResize={ ( _event, _direction, elt, delta ) => {
				let columnPercentages = []

				setIsEditWidth( false )

				// In desktop, when one column is resized, the next column is adjusted also.
				if ( isDesktop ) {
					// Compute for the new widths.
					const columnWidths = [ ...currentWidths ]
					const totalWidth = currentWidths.reduce( ( a, b ) => a + b, 0 )
					const adjacentBlockIndex = _direction === 'right' ? blockIndex + 1 : blockIndex - 1
					columnWidths[ adjacentBlockIndex ] -= delta.width
					columnWidths[ blockIndex ] += delta.width

					// Fix the widths, ensure that our total width is 100%
					columnPercentages = ( columnWidths || [] ).map( width => {
						return parseFloat( ( width / totalWidth * 100 ).toFixed( 1 ) )
					} )
					const totalCurrentWidth = columnPercentages.reduce( ( a, b ) => a + b, 0 )
					if ( totalCurrentWidth !== 100 ) {
						columnPercentages[ adjacentBlockIndex ] = parseFloat( ( columnPercentages[ adjacentBlockIndex ] + 100 - totalCurrentWidth ).toFixed( 1 ) )
					}

					setNewWidthsPercent( columnPercentages )

					// Add the temporary styles for our column widths.
					const columnStyles = columnPercentages.map( ( width, i ) => {
						return `[data-block="${ adjacentBlocks[ i ].clientId }"] {
							flex: 1 1 ${ width }% !important;
							max-width: ${ width }% !important;
						}
						[data-block="${ adjacentBlocks[ i ].clientId }"] .test {
							--test: '${ width }%' !important;
						}`
					} ).join( '' )
					setTempStyles( columnStyles )

					// Set snap widths. We need to do this here not on
					// ResizeStart or it won't be used at first drag.
					if ( ! snapWidths ) {
						setSnapWidths( { x: getSnapWidths( columnWidths, blockIndex, totalWidth, _direction, isShiftKey ) } )
					}

				// In tablet and mobile, when the column is resized, it's
				// adjusted alone, it can span the whole width for responsive
				// control.
				} else {
					const newWidth = currentWidths + delta.width
					columnPercentages = clamp( parseFloat( ( newWidth / maxWidth * 100 ).toFixed( 1 ) ), 0, 100 )

					setNewWidthsPercent( columnPercentages )

					// Add the temporary styles for our column widths.
					const columnStyles = `[data-block="${ props.blockProps.clientId }"] {
							flex: 1 1 ${ columnPercentages }% !important;
							max-width: ${ columnPercentages }% !important;
						}
						[data-block="${ props.blockProps.clientId }"] .test {
							--test: '${ columnPercentages }%' !important;
						}`
					setTempStyles( columnStyles )

					// Set snap widths. We need to do this here not on
					// ResizeStart or it won't be used at first drag.
					if ( ! snapWidths ) {
						setSnapWidths( { x: getSnapWidths( [ 100 ], 0, maxWidth, _direction, isShiftKey ) } )
					}
				}
			} }
			onResizeStop={ ( _event, _direction, elt, delta ) => {
				// Update the block widths.
				if ( delta.width ) {
					if ( isDesktop ) {
						// For even 3-columns, floats have a tendency of being
						// unequal, e.g. 33.35 or 33.43, assume to be equal.
						if ( isEqual( newWidthsPercent.map( n => n | 0 ), [ 33, 33, 33 ] ) ) { // eslint-disable-line no-bitwise
							props.onChangeDesktop( [ 33.33, 33.33, 33.33 ] )
						} else {
							props.onChangeDesktop( newWidthsPercent )
						}
					} else if ( isTablet ) {
						props.onChangeTablet( newWidthsPercent )
					} else {
						props.onChangeMobile( newWidthsPercent )
					}
				}

				// Wait until all attribute updates have been applied.
				if ( tempStyles ) {
					setTimeout( () => {
						if ( isMounted ) {
							setTempStyles( '' )
						}
					}, 400 )
				}

				setSnapWidths( null )
			} }
		>
			{
				! isOnlyBlock && isEditWidth &&
				<div className="stk-resizable-column__popup" ref={ popupRef }>
					{ /* <TextControl
						label="Column"
						className="stk-resizable-column__input"
						value={ props.blockProps.attributes.columnWidth }
						onChange={ value => props.blockProps.setAttributes( { columnWidth: value } ) }
						onBlur={ () => setIsEditWidth( false ) }
					/> */ }
					<AdvancedTextControl
						label="Column"
						className="stk-resizable-column__input"
						value={ props.blockProps.attributes.columnWidth }
						onChange={ value => props.blockProps.setAttributes( { columnWidth: value } ) }
						// onBlur={ () => setIsEditWidth( false ) }
						units={ [ '%', 'px' ] }
						unit="%"
						allowReset={ true }
						placeholder={ defaultInputValue }
					/>
					{ /* % */ }
				</div>
				// <input
				// 	className="components-text-control__input stk-resizable-column__input"
				// 	type="text"
				// 	// id={ id }
				// 	value={ props.blockProps.attributes.columnWidth }
				// 	onChange={ event => {
				// 		const value = event.target.value
				// 		console.log( 'value', value )
				// 		props.blockProps.setAttributes( { columnWidth: value } )
				// 	} }
				// 	// aria-label={ __( 'Column width', i18n ) }
				// 	// aria-describedby={ !! help ? id + '__help' : undefined }
				// 	// { ...props }
				// />
			}
			{
				! isOnlyBlock && <div className="test"
					style={ { '--test': `'${ props.blockProps.attributes.columnWidth || defaultInputValue }%'` } }
					onClick={ () => setIsEditWidth( ! isEditWidth ) }
					onKeyDown={ event => {
						if ( event.keyCode === 13 ) {
							setIsEditWidth( ! isEditWidth )
						}
					} }
					role="button"
					tabIndex="0"
				></div>
			 }
			{ tempStyles && <style>{ tempStyles }</style> }
			{ props.children }
		</ResizableBox>
	)
}

const ResizableTooltip = props => {
	return (
		<div className="test" style={ { '--test': `'${ props.blockProps.attributes.columnWidth }'` } }></div>
	)
}

ResizableTooltip.defaultProps = {
	deviceType: 'Desktop',

}

ResizableColumn.defaultProps = {
	className: '',
	showHandle: true,
	blockProps: {},
	onChangeDesktop: () => {},
	onChangeTablet: () => {},
	onChangeMobile: () => {},
	onResetDesktop: () => {},
}

export default compose( [
	withSelect( select => {
		const {
			__experimentalGetPreviewDeviceType,
		} = select( 'core/edit-post' )

		return {
			previewDeviceType: __experimentalGetPreviewDeviceType(),
		}
	} ),
] )( ResizableColumn )